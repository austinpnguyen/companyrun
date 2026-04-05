// ============================================================
// Orchestrator — the CEO daemon
// ============================================================
//
// Main heartbeat loop that coordinates task scheduling,
// hiring/firing decisions, and user consultations.
// ============================================================

import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { orchestratorState, activityLog } from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { generateId } from '../shared/utils.js';
import { agentManager } from '../agents/manager.js';
import { llmGateway } from '../llm/gateway.js';
import type { LLMMessage } from '../llm/providers/base.js';
import { taskScheduler } from './scheduler.js';
import { decisionEngine } from './decision-engine.js';
import { consultationSystem } from './consultation.js';
import type { Decision } from './decision-engine.js';
import { taskExecutor } from '../tasks/executor.js';
import { adversarialPipeline } from '../tasks/adversarial.js';
import { cronManager } from '../tasks/cron.js';

const log = createLogger('orchestrator');

// ============================================================
// CEO System Prompt
// ============================================================

const CEO_SYSTEM_PROMPT = `You are the CEO of an AI company. You manage a team of AI agents (employees) who perform tasks.

## Your Capabilities
You can interpret user commands and respond with structured JSON actions. You MUST respond with valid JSON.

### Available Actions
1. **hire** — Hire a new agent
   Response: { "action": "hire", "role": "<role>", "name": "<name>" }
   Available roles: developer, writer, analyst, designer, support

2. **fire** — Fire an agent
   Response: { "action": "fire", "agentId": "<id>", "reason": "<reason>" }

3. **list_agents** — List all agents
   Response: { "action": "list_agents", "filter": "<status or 'all'>" }

4. **assign_task** — Assign a task to an agent
   Response: { "action": "assign_task", "taskId": "<id>", "agentId": "<id>" }

5. **status** — Get company status
   Response: { "action": "status" }

6. **approve_decision** — Approve a pending decision
   Response: { "action": "approve_decision", "decisionId": "<id>" }

7. **reject_decision** — Reject a pending decision
   Response: { "action": "reject_decision", "decisionId": "<id>" }

8. **chat** — General response to the user (no specific action)
   Response: { "action": "chat", "message": "<your response>" }

## Rules
- Always respond with a single JSON object
- If the user's intent is unclear, use the "chat" action to ask for clarification
- Be concise and professional
- When hiring, suggest a good name for the agent if the user doesn't provide one
- When you can't determine the right action, default to "chat"
`;

// ============================================================
// Orchestrator
// ============================================================

export class Orchestrator {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private heartbeatMs: number;
  private lastHeartbeat: Date | null = null;
  private stateId: string | null = null;

  constructor() {
    this.heartbeatMs = env.ORCHESTRATOR_HEARTBEAT_MS;
  }

  // ----------------------------------------------------------
  // Start the orchestrator daemon
  // ----------------------------------------------------------

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warn('Orchestrator is already running');
      return;
    }

    log.info(
      { heartbeatMs: this.heartbeatMs },
      'Starting orchestrator daemon',
    );

    // Ensure orchestrator_state row exists
    await this.ensureStateRow();

    // Load any persisted decisions from the database
    await decisionEngine.loadPersistedDecisions();

    // Start the cron scheduler (60-second tick)
    cronManager.start();

    this.isRunning = true;

    // Run first heartbeat immediately
    await this.heartbeat();

    // Schedule recurring heartbeats
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.heartbeat();
      } catch (error) {
        log.error({ error }, 'Unhandled error in heartbeat interval');
      }
    }, this.heartbeatMs);

    await db.insert(activityLog).values({
      actor: 'orchestrator',
      action: 'orchestrator_started',
      entityType: 'system',
      details: { heartbeatMs: this.heartbeatMs },
    });

    log.info('Orchestrator daemon started');
  }

  // ----------------------------------------------------------
  // Stop the orchestrator
  // ----------------------------------------------------------

  async stop(): Promise<void> {
    if (!this.isRunning) {
      log.warn('Orchestrator is not running');
      return;
    }

    log.info('Stopping orchestrator daemon');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    cronManager.stop();
    this.isRunning = false;

    // Update state
    if (this.stateId) {
      await db
        .update(orchestratorState)
        .set({
          status: 'stopped',
          updatedAt: new Date(),
        })
        .where(eq(orchestratorState.id, this.stateId));
    }

    await db.insert(activityLog).values({
      actor: 'orchestrator',
      action: 'orchestrator_stopped',
      entityType: 'system',
      details: {},
    });

    log.info('Orchestrator daemon stopped');
  }

  // ----------------------------------------------------------
  // Main heartbeat
  // ----------------------------------------------------------

  private async heartbeat(): Promise<void> {
    const startMs = Date.now();

    try {
      // 1. Update heartbeat timestamp in orchestrator_state
      this.lastHeartbeat = new Date();
      if (this.stateId) {
        await db
          .update(orchestratorState)
          .set({
            status: 'running',
            lastHeartbeat: this.lastHeartbeat,
            updatedAt: this.lastHeartbeat,
          })
          .where(eq(orchestratorState.id, this.stateId));
      }

      // 2. Schedule queued tasks
      const assignments = await taskScheduler.scheduleQueuedTasks();
      if (assignments.length > 0) {
        log.info(
          { assigned: assignments.length },
          'Tasks assigned during heartbeat',
        );
      }

      // 3. Execute assigned tasks through agent runtimes (parallel)
      const execution = await taskExecutor.executeAssignedTasks();
      if (execution.started > 0) {
        log.info(
          { started: execution.started, running: execution.running },
          'Task execution batch started',
        );
      }

      // 4. Adversarial review pass — dispatch completed tasks to adversarial agents
      const adversarial = await adversarialPipeline.reviewCompletedTasks();
      if (adversarial.dispatched > 0) {
        log.info(
          { dispatched: adversarial.dispatched },
          'Adversarial review dispatched',
        );
      }

      // 5. Run decision engine analysis
      const newDecisions = await decisionEngine.analyze();

      // 6. Create consultation requests for decisions that need user input
      for (const decision of newDecisions) {
        if (this.requiresUserApproval(decision)) {
          await consultationSystem.createRequest(decision);
        }
      }

      // 7. Auto-process decisions that don't require approval
      for (const decision of newDecisions) {
        if (!this.requiresUserApproval(decision)) {
          await this.autoProcessDecision(decision);
        }
      }

      // 8. Prune stale decisions
      decisionEngine.pruneStaleDecisions();

      const elapsedMs = Date.now() - startMs;
      log.debug(
        {
          elapsedMs,
          assignments: assignments.length,
          newDecisions: newDecisions.length,
          pendingConsultations: consultationSystem.getPendingCount(),
        },
        'Heartbeat complete',
      );
    } catch (error) {
      log.error(
        { error, elapsedMs: Date.now() - startMs },
        'Error during heartbeat',
      );
    }
  }

  // ----------------------------------------------------------
  // Process a user command via the LLM
  // ----------------------------------------------------------

  async processCommand(command: string): Promise<string> {
    log.info({ command }, 'Processing user command');

    try {
      // Build context for the LLM
      const activeAgents = await agentManager.listAgents({ status: 'active' });
      const pendingDecisions = decisionEngine.getPendingDecisions();
      const pendingConsultations = consultationSystem.getPendingRequests();

      const contextMessage = [
        `Current company state:`,
        `- Active agents: ${activeAgents.length}`,
        activeAgents.length > 0
          ? `  ${activeAgents.map((a) => `${a.name} (${a.role}, id: ${a.id})`).join(', ')}`
          : '  (none)',
        `- Pending decisions: ${pendingDecisions.length}`,
        pendingDecisions.length > 0
          ? pendingDecisions.map((d) => `  [${d.id}] ${d.type}: ${d.reason}`).join('\n')
          : '',
        `- Pending consultations: ${pendingConsultations.length}`,
        pendingConsultations.length > 0
          ? pendingConsultations.map((c) => `  [${c.id}] ${c.question}`).join('\n')
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const messages: LLMMessage[] = [
        { role: 'system', content: CEO_SYSTEM_PROMPT },
        { role: 'user', content: `${contextMessage}\n\nUser command: ${command}` },
      ];

      const response = await llmGateway.chat({
        provider: env.ORCHESTRATOR_PROVIDER,
        model: env.ORCHESTRATOR_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      });

      const content = response.choices[0]?.message?.content ?? '';

      // Try to parse the LLM response as a JSON action
      const result = await this.executeAction(content);

      await db.insert(activityLog).values({
        actor: 'orchestrator',
        action: 'command_processed',
        entityType: 'system',
        details: {
          command,
          response: result,
        },
      });

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.error({ error, command }, 'Error processing command');
      return `Error processing command: ${msg}`;
    }
  }

  // ----------------------------------------------------------
  // Execute a parsed action from the LLM
  // ----------------------------------------------------------

  private async executeAction(llmResponse: string): Promise<string> {
    let parsed: Record<string, unknown>;

    try {
      // Extract JSON from the response (handle markdown code blocks)
      const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return llmResponse; // Not JSON — return as-is (chat response)
      }
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      // If we can't parse JSON, treat the whole response as a chat message
      return llmResponse;
    }

    const action = parsed.action as string;

    switch (action) {
      case 'hire': {
        const role = (parsed.role as string) ?? 'developer';
        const name = (parsed.name as string) ?? `Agent-${generateId().slice(0, 6)}`;

        try {
          const result = await agentManager.hire({
            templateRole: role,
            name,
          });
          return `✅ Hired "${name}" as ${role} (ID: ${result.agentId})`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `❌ Failed to hire: ${msg}`;
        }
      }

      case 'fire': {
        const agentId = parsed.agentId as string;
        const reason = (parsed.reason as string) ?? 'Terminated by CEO';

        if (!agentId) {
          return '❌ Cannot fire: no agent ID specified';
        }

        try {
          await agentManager.fire(agentId, reason);
          return `✅ Agent ${agentId} has been fired. Reason: ${reason}`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `❌ Failed to fire agent: ${msg}`;
        }
      }

      case 'list_agents': {
        const filter = parsed.filter as string | undefined;
        const agentList = await agentManager.listAgents(
          filter && filter !== 'all' ? { status: filter } : undefined,
        );

        if (agentList.length === 0) {
          return '📋 No agents found.';
        }

        const lines = agentList.map(
          (a) => `• **${a.name}** — ${a.role} (${a.status}) [ID: ${a.id}]`,
        );
        return `📋 Agents (${agentList.length}):\n${lines.join('\n')}`;
      }

      case 'status': {
        const status = this.getStatus();
        return [
          `🏢 **Company Status**`,
          `- Orchestrator: ${status.isRunning ? '🟢 Running' : '🔴 Stopped'}`,
          `- Last heartbeat: ${status.lastHeartbeat?.toISOString() ?? 'never'}`,
          `- Active agents: ${status.activeAgents}`,
          `- Pending decisions: ${status.pendingDecisions}`,
          `- Pending consultations: ${status.pendingConsultations}`,
        ].join('\n');
      }

      case 'approve_decision': {
        const decisionId = parsed.decisionId as string;
        if (!decisionId) {
          return '❌ No decision ID specified';
        }

        try {
          await decisionEngine.approveDecision(decisionId);

          // Execute the approved decision
          const approved = Array.from(
            (decisionEngine as unknown as { pendingDecisions: Map<string, Decision> }).pendingDecisions.values(),
          ).find((d) => d.id === decisionId);

          if (approved) {
            const result = await this.executeApprovedDecision(approved);
            return `✅ Decision approved and executed. ${result}`;
          }

          return `✅ Decision ${decisionId} approved`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `❌ Failed to approve decision: ${msg}`;
        }
      }

      case 'reject_decision': {
        const decisionId = parsed.decisionId as string;
        if (!decisionId) {
          return '❌ No decision ID specified';
        }

        try {
          await decisionEngine.rejectDecision(decisionId);
          return `✅ Decision ${decisionId} rejected`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `❌ Failed to reject decision: ${msg}`;
        }
      }

      case 'chat': {
        return (parsed.message as string) ?? llmResponse;
      }

      default: {
        return (parsed.message as string) ?? llmResponse;
      }
    }
  }

  // ----------------------------------------------------------
  // Execute an approved decision (hire/fire)
  // ----------------------------------------------------------

  private async executeApprovedDecision(decision: Decision): Promise<string> {
    switch (decision.type) {
      case 'hire': {
        const role = decision.templateRole ?? 'developer';
        const name = `Agent-${generateId().slice(0, 6)}`;
        try {
          const result = await agentManager.hire({ templateRole: role, name });
          return `Hired "${name}" as ${role} (ID: ${result.agentId})`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `Failed to hire: ${msg}`;
        }
      }

      case 'fire': {
        if (!decision.targetAgentId) return 'No target agent specified';
        try {
          await agentManager.fire(decision.targetAgentId, decision.reason);
          return `Agent ${decision.targetAgentId} terminated`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `Failed to fire: ${msg}`;
        }
      }

      case 'warn': {
        if (!decision.targetAgentId) return 'No target agent specified';
        try {
          await agentManager.setStatus(decision.targetAgentId, 'warning');
          return `Agent ${decision.targetAgentId} has been issued a warning`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `Failed to warn: ${msg}`;
        }
      }

      case 'retrain': {
        if (!decision.targetAgentId) return 'No target agent specified';
        try {
          await agentManager.setStatus(decision.targetAgentId, 'review');
          return `Agent ${decision.targetAgentId} set to review/retraining`;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return `Failed to retrain: ${msg}`;
        }
      }

      default:
        return `Decision type "${decision.type}" processed`;
    }
  }

  // ----------------------------------------------------------
  // Check if a decision requires user approval
  // ----------------------------------------------------------

  private requiresUserApproval(decision: Decision): boolean {
    // Fire decisions ALWAYS require user approval
    if (decision.type === 'fire') return true;

    // Hire decisions require approval
    if (decision.type === 'hire') return true;

    // Warnings and retraining can be auto-approved
    return false;
  }

  // ----------------------------------------------------------
  // Auto-process decisions that don't need user approval
  // ----------------------------------------------------------

  private async autoProcessDecision(decision: Decision): Promise<void> {
    try {
      await decisionEngine.approveDecision(decision.id);
      const result = await this.executeApprovedDecision(decision);

      log.info(
        { decisionId: decision.id, type: decision.type, result },
        'Decision auto-processed',
      );
    } catch (error) {
      log.error(
        { error, decisionId: decision.id },
        'Failed to auto-process decision',
      );
    }
  }

  // ----------------------------------------------------------
  // Get orchestrator status
  // ----------------------------------------------------------

  getStatus(): {
    isRunning: boolean;
    lastHeartbeat: Date | null;
    activeAgents: number;
    pendingDecisions: number;
    pendingConsultations: number;
  } {
    return {
      isRunning: this.isRunning,
      lastHeartbeat: this.lastHeartbeat,
      activeAgents: 0, // Will be populated on demand; sync getter
      pendingDecisions: decisionEngine.getPendingDecisions().length,
      pendingConsultations: consultationSystem.getPendingCount(),
    };
  }

  // ----------------------------------------------------------
  // Ensure orchestrator_state row exists
  // ----------------------------------------------------------

  private async ensureStateRow(): Promise<void> {
    const [existing] = await db
      .select()
      .from(orchestratorState)
      .limit(1);

    if (existing) {
      this.stateId = existing.id;
      await db
        .update(orchestratorState)
        .set({
          status: 'running',
          lastHeartbeat: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orchestratorState.id, existing.id));
    } else {
      const [newState] = await db
        .insert(orchestratorState)
        .values({
          status: 'running',
          lastHeartbeat: new Date(),
          pendingDecisions: [],
          config: {},
        })
        .returning();

      this.stateId = newState.id;
    }

    log.debug({ stateId: this.stateId }, 'Orchestrator state row ensured');
  }
}

// ============================================================
// Singleton
// ============================================================

export const orchestrator = new Orchestrator();

// ============================================================
// Re-exports
// ============================================================

export { TaskScheduler, taskScheduler } from './scheduler.js';
export type { SchedulerResult } from './scheduler.js';
export { DecisionEngine, decisionEngine } from './decision-engine.js';
export type { Decision } from './decision-engine.js';
export { ConsultationSystem, consultationSystem } from './consultation.js';
export type { ConsultationRequest } from './consultation.js';
export { taskExecutor } from '../tasks/executor.js';
export { adversarialPipeline } from '../tasks/adversarial.js';
