// ============================================================
// Task Executor — runs assigned tasks through agent runtimes
// ============================================================
//
// The orchestrator heartbeat calls executeAssignedTasks() every
// tick. Tasks are run in parallel up to PIPELINE_CONCURRENCY.
// Each task is dispatched to its assigned agent's runtime as a
// structured prompt; the response is stored as the task result.
// ============================================================

import { eq, and, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../config/database.js';
import { tasks, agents, activityLog } from '../db/schema.js';
import { agentManager } from '../agents/manager.js';
import { createLogger } from '../shared/logger.js';
import { taskManager } from './manager.js';
import type { Task } from '../shared/types.js';

// ── Zod schema for structured task responses ──────────────────
// If agent returns valid JSON matching this, we store it structured.
// If not, we store the raw string — both are valid.
const TaskResponseSchema = z.object({
  summary:         z.string(),
  deliverables:    z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
  status:          z.enum(['success', 'partial', 'blocked']).optional(),
  blockers:        z.array(z.string()).optional(),
}).passthrough();

type StructuredTaskResponse = z.infer<typeof TaskResponseSchema>;

function tryParseStructured(raw: string): StructuredTaskResponse | null {
  try {
    // Strip markdown code fences if present
    const stripped = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed = JSON.parse(stripped);
    return TaskResponseSchema.parse(parsed);
  } catch {
    return null;
  }
}

/** Sleep for ms milliseconds */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const log = createLogger('tasks:executor');

/** Maximum number of tasks running simultaneously */
const PIPELINE_CONCURRENCY = 3;

// ============================================================
// TaskExecutor
// ============================================================

export class TaskExecutor {
  /** Task IDs currently being executed (in-flight) */
  private runningTasks = new Set<string>();

  // ----------------------------------------------------------
  // Main entry point — called from orchestrator heartbeat
  // ----------------------------------------------------------

  async executeAssignedTasks(): Promise<{ started: number; running: number }> {
    const slots = PIPELINE_CONCURRENCY - this.runningTasks.size;

    if (slots <= 0) {
      log.debug(
        { running: this.runningTasks.size, concurrency: PIPELINE_CONCURRENCY },
        'Pipeline at capacity — skipping execution tick',
      );
      return { started: 0, running: this.runningTasks.size };
    }

    // Fetch assigned tasks that aren't already running
    const assignedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'assigned'),
          sql`${tasks.assignedAgentId} IS NOT NULL`,
        ),
      )
      .limit(slots);

    // Filter out tasks we're already running (in case DB is slightly behind)
    const notRunning = assignedTasks.filter((t) => !this.runningTasks.has(t.id));

    if (notRunning.length === 0) {
      return { started: 0, running: this.runningTasks.size };
    }

    // ── DAG dependency check ──────────────────────────────────
    // Only run tasks whose dependsOn list is fully completed.
    const candidates = await this.filterReadyTasks(notRunning);

    if (candidates.length === 0) {
      log.debug({ blocked: notRunning.length }, 'All candidates blocked by dependencies');
      return { started: 0, running: this.runningTasks.size };
    }

    log.info(
      { candidates: candidates.length, slotsAvailable: slots },
      'Starting task execution batch',
    );

    let started = 0;
    for (const task of candidates.slice(0, slots)) {
      this.runningTasks.add(task.id);
      started++;

      // Fire-and-forget: do NOT await — this runs in background
      this.runTaskWithRetry(task).catch((err) => {
        log.error({ err, taskId: task.id }, 'Unhandled error in task execution');
        this.runningTasks.delete(task.id);
      });
    }

    return { started, running: this.runningTasks.size };
  }

  // ----------------------------------------------------------
  // DAG: filter tasks whose dependsOn are all completed
  // ----------------------------------------------------------

  private async filterReadyTasks(candidates: Task[]): Promise<Task[]> {
    const ready: Task[] = [];

    for (const task of candidates) {
      const deps = (task.dependsOn ?? []) as string[];
      if (deps.length === 0) {
        ready.push(task);
        continue;
      }

      // Check all dependency statuses
      const depRows = await db
        .select({ id: tasks.id, status: tasks.status })
        .from(tasks)
        .where(inArray(tasks.id, deps));

      const allDone = depRows.length === deps.length
        && depRows.every((r) => r.status === 'completed');

      if (allDone) {
        ready.push(task);
      } else {
        log.debug(
          { taskId: task.id, deps, depStatuses: depRows.map((r) => r.status) },
          'Task blocked by unfinished dependencies',
        );
      }
    }

    return ready;
  }

  // ----------------------------------------------------------
  // Retry wrapper — exponential backoff up to task.maxRetries
  // ----------------------------------------------------------

  private async runTaskWithRetry(task: Task): Promise<void> {
    const maxRetries = (task.maxRetries ?? 2) as number;
    const baseDelayMs = 3_000; // 3s → 6s → 12s

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.runTask(task);
        return; // success
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);

        if (attempt >= maxRetries) {
          log.error(
            { taskId: task.id, attempt, reason },
            'Task exhausted all retries — marking failed',
          );
          try {
            await taskManager.fail(task.id, `Exhausted ${maxRetries} retries. Last error: ${reason}`);
          } catch { /* already failed or terminal */ }
          return;
        }

        const delay = baseDelayMs * Math.pow(2, attempt);
        log.warn(
          { taskId: task.id, attempt, maxRetries, delayMs: delay, reason },
          'Task failed — retrying with backoff',
        );

        // Persist retry count
        try {
          await db
            .update(tasks)
            .set({ retryCount: attempt + 1, status: 'assigned' })
            .where(eq(tasks.id, task.id));
        } catch { /* non-fatal */ }

        await sleep(delay);
      }
    }
  }

  // ----------------------------------------------------------
  // Execute a single task through its assigned agent
  // ----------------------------------------------------------

  private async runTask(task: Task): Promise<void> {
    const taskId = task.id;
    log.info({ taskId, title: task.title, agentId: task.assignedAgentId }, 'Executing task');

    try {
      // Verify agent is still active
      if (!task.assignedAgentId) {
        throw new Error('Task has no assigned agent');
      }

      const agent = await db
        .select({ id: agents.id, name: agents.name, status: agents.status })
        .from(agents)
        .where(eq(agents.id, task.assignedAgentId))
        .limit(1);

      if (!agent[0] || agent[0].status !== 'active') {
        log.warn(
          { taskId, agentId: task.assignedAgentId },
          'Assigned agent is not active — returning task to queue',
        );
        await taskManager.unassign(taskId);
        return;
      }

      // Transition to in_progress
      await taskManager.start(taskId);

      // Build the task prompt
      const prompt = this.buildTaskPrompt(task);

      // Send to agent runtime — use taskId as the conversation ID
      const result = await agentManager.sendMessage(
        task.assignedAgentId,
        `task:${taskId}`,
        prompt,
      );

      // Try to parse agent response as structured JSON (Zod validation)
      const structured = tryParseStructured(result.response);

      // Store result and mark completed
      await taskManager.complete(taskId, {
        response: result.response,
        structured: structured ?? undefined,
        tokensUsed: result.tokensUsed,
        cost: result.cost,
        toolCalls: result.toolCalls.length,
        executedAt: new Date().toISOString(),
        ...(structured ? { parsedOk: true } : {}),
      });

      log.info(
        {
          taskId,
          title: task.title,
          agentId: task.assignedAgentId,
          tokens: result.tokensUsed,
        },
        'Task completed successfully',
      );

      // Log activity
      await db.insert(activityLog).values({
        actor: task.assignedAgentId,
        action: 'task_executed',
        entityType: 'task',
        entityId: taskId,
        details: {
          title: task.title,
          agentId: task.assignedAgentId,
          tokensUsed: result.tokensUsed,
          cost: result.cost,
        },
      });
    } catch (error) {
      // Re-throw so runTaskWithRetry can handle retry logic
      throw error;
    } finally {
      this.runningTasks.delete(taskId);
    }
  }

  // ----------------------------------------------------------
  // Build a structured prompt from a Task record
  // ----------------------------------------------------------

  private buildTaskPrompt(task: Task): string {
    const lines: string[] = [
      `# Task Assignment`,
      ``,
      `**Title:** ${task.title}`,
    ];

    if (task.description) {
      lines.push(`**Description:** ${task.description}`);
    }

    if (task.priority && task.priority !== 'normal') {
      lines.push(`**Priority:** ${task.priority.toUpperCase()}`);
    }

    if (task.complexity && task.complexity > 1) {
      lines.push(`**Complexity:** ${task.complexity}/5`);
    }

    const skills = task.requiredSkills as string[] | null;
    if (skills && skills.length > 0) {
      lines.push(`**Required skills:** ${skills.join(', ')}`);
    }

    lines.push(
      ``,
      `Please complete this task. Be thorough and provide a clear, structured response.`,
      `Your output will be reviewed for quality.`,
    );

    return lines.join('\n');
  }

  // ----------------------------------------------------------
  // How many tasks are currently in-flight
  // ----------------------------------------------------------

  get runningCount(): number {
    return this.runningTasks.size;
  }
}

// ============================================================
// Singleton
// ============================================================

export const taskExecutor = new TaskExecutor();
