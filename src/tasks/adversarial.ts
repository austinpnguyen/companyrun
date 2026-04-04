// ============================================================
// Adversarial Pipeline — auto-review tasks with adversarial agents
// ============================================================
//
// After a task completes, this pipeline dispatches the result
// to all active adversarial agents (Auditor, Devil's Advocate,
// Competitor) in parallel. Their structured reviews are stored
// in task.result.adversarialReviews.
//
// Adversarial agents are identified by isAdversarial = true on
// their agent record. They run through the same AgentRuntime as
// regular agents but receive a specially formatted prompt.
// ============================================================

import { eq, and } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tasks, agents, activityLog } from '../db/schema.js';
import { agentManager } from '../agents/manager.js';
import { createLogger } from '../shared/logger.js';
import type { Task } from '../shared/types.js';

const log = createLogger('tasks:adversarial');

// ============================================================
// Types
// ============================================================

export interface AdversarialReview {
  agentId: string;
  agentName: string;
  role: string;
  review: string;
  reviewedAt: string;
}

// ============================================================
// AdversarialPipeline
// ============================================================

export class AdversarialPipeline {
  /** Task IDs currently being adversarially reviewed */
  private reviewingTasks = new Set<string>();

  // ----------------------------------------------------------
  // Main entry point — called from orchestrator heartbeat
  // ----------------------------------------------------------

  async reviewCompletedTasks(): Promise<{ dispatched: number }> {
    // Find completed tasks that haven't been adversarially reviewed yet
    const completedTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.status, 'completed'))
      .limit(10);

    // Filter: not already reviewing + not already reviewed
    const pending = completedTasks.filter((t) => {
      if (this.reviewingTasks.has(t.id)) return false;
      const result = t.result as Record<string, unknown> | null;
      return !result?.adversarialStatus;
    });

    if (pending.length === 0) {
      return { dispatched: 0 };
    }

    // Get active adversarial agents
    const adversarialAgents = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.status, 'active'),
          eq(agents.isAdversarial, true),
        ),
      );

    if (adversarialAgents.length === 0) {
      log.debug('No active adversarial agents — skipping review pass');
      return { dispatched: 0 };
    }

    log.info(
      { pendingTasks: pending.length, adversarialAgents: adversarialAgents.length },
      'Starting adversarial review pass',
    );

    let dispatched = 0;
    for (const task of pending) {
      this.reviewingTasks.add(task.id);
      dispatched++;

      // Fire-and-forget
      this.runReview(task, adversarialAgents).catch((err) => {
        log.error({ err, taskId: task.id }, 'Unhandled error in adversarial review');
        this.reviewingTasks.delete(task.id);
      });
    }

    return { dispatched };
  }

  // ----------------------------------------------------------
  // Run all adversarial agents on a completed task in parallel
  // ----------------------------------------------------------

  private async runReview(
    task: Task,
    adversarialAgents: { id: string; name: string; role: string }[],
  ): Promise<void> {
    // Mark as reviewing
    await this.updateAdversarialStatus(task, 'reviewing', []);

    log.info(
      { taskId: task.id, title: task.title, reviewers: adversarialAgents.length },
      'Adversarial review started',
    );

    const prompt = this.buildReviewPrompt(task);
    const conversationBase = `adversarial:${task.id}`;

    // Run all adversarial agents in parallel
    const reviewPromises = adversarialAgents.map(async (agent): Promise<AdversarialReview | null> => {
      try {
        const result = await agentManager.sendMessage(
          agent.id,
          `${conversationBase}:${agent.id}`,
          prompt,
        );

        return {
          agentId: agent.id,
          agentName: agent.name,
          role: agent.role,
          review: result.response,
          reviewedAt: new Date().toISOString(),
        };
      } catch (err) {
        log.warn({ err, agentId: agent.id, taskId: task.id }, 'Adversarial agent failed to review');
        return null;
      }
    });

    const results = await Promise.all(reviewPromises);
    const reviews = results.filter((r): r is AdversarialReview => r !== null);

    // Store reviews on the task
    await this.updateAdversarialStatus(task, 'reviewed', reviews);

    log.info(
      { taskId: task.id, reviewsCompleted: reviews.length },
      'Adversarial review completed',
    );

    // Log activity
    await db.insert(activityLog).values({
      actor: 'orchestrator',
      action: 'adversarial_review_completed',
      entityType: 'task',
      entityId: task.id,
      details: {
        title: task.title,
        reviewers: reviews.map((r) => ({ name: r.agentName, role: r.role })),
      },
    });

    this.reviewingTasks.delete(task.id);
  }

  // ----------------------------------------------------------
  // Build the prompt sent to adversarial agents
  // ----------------------------------------------------------

  private buildReviewPrompt(task: Task): string {
    const result = task.result as Record<string, unknown> | null;
    const agentResponse = (result?.response as string) ?? 'No response recorded.';

    return [
      `# Work Product for Review`,
      ``,
      `**Original Task:** ${task.title}`,
      task.description ? `**Description:** ${task.description}` : null,
      task.priority ? `**Priority:** ${task.priority}` : null,
      ``,
      `## Work Output`,
      agentResponse,
      ``,
      `---`,
      `Review the above work product according to your role and output format.`,
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
  }

  // ----------------------------------------------------------
  // Persist adversarial review state into task.result JSONB
  // ----------------------------------------------------------

  private async updateAdversarialStatus(
    task: Task,
    status: 'reviewing' | 'reviewed',
    reviews: AdversarialReview[],
  ): Promise<void> {
    const existingResult = (task.result as Record<string, unknown>) ?? {};

    const updatedResult: Record<string, unknown> = {
      ...existingResult,
      adversarialStatus: status,
    };

    if (status === 'reviewed' && reviews.length > 0) {
      updatedResult.adversarialReviews = reviews;
      updatedResult.adversarialReviewedAt = new Date().toISOString();
    }

    await db
      .update(tasks)
      .set({ result: updatedResult, updatedAt: new Date() })
      .where(eq(tasks.id, task.id));
  }

  // ----------------------------------------------------------
  // How many tasks are currently in review
  // ----------------------------------------------------------

  get reviewingCount(): number {
    return this.reviewingTasks.size;
  }
}

// ============================================================
// Singleton
// ============================================================

export const adversarialPipeline = new AdversarialPipeline();
