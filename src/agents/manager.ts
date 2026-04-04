// ============================================================
// Agent Manager — lifecycle management (hire, fire, activate)
// ============================================================

import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { agents, wallets, activityLog } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';
import type { Agent } from '../shared/types.js';
import { AgentRuntime } from './runtime.js';
import type { AgentRuntimeConfig } from './runtime.js';
import { getTemplateByRole } from './templates.js';
import type { AgentTemplate } from './templates.js';

const log = createLogger('agents:manager');

/** Starting bonus for newly hired agents (in credits) */
const INITIAL_WALLET_BALANCE = '100.00';

// ============================================================
// AgentManager
// ============================================================

export class AgentManager {
  private activeAgents: Map<string, AgentRuntime> = new Map();

  // ----------------------------------------------------------
  // Hire a new agent
  // ----------------------------------------------------------

  async hire(params: {
    templateRole?: string;
    customConfig?: Partial<AgentTemplate>;
    name: string;
  }): Promise<{ agentId: string; agent: Agent }> {
    let template: AgentTemplate | undefined;

    // Resolve from template or custom config
    if (params.templateRole) {
      template = getTemplateByRole(params.templateRole);
      if (!template) {
        throw new ValidationError(
          `Unknown template role: "${params.templateRole}". Available roles: developer, writer, analyst, designer, support`,
        );
      }
    }

    // Merge template with any custom overrides
    const role = params.customConfig?.role ?? template?.role ?? 'general';
    const systemPrompt =
      params.customConfig?.systemPrompt ??
      template?.systemPrompt ??
      'You are a helpful AI assistant employed by this company.';
    const provider =
      params.customConfig?.defaultProvider ??
      template?.defaultProvider ??
      'openrouter';
    const model =
      params.customConfig?.defaultModel ??
      template?.defaultModel ??
      'openai/gpt-4o';
    const personality = {
      creativity:
        params.customConfig?.personality?.creativity ??
        template?.personality.creativity ??
        0.5,
      verbosity:
        params.customConfig?.personality?.verbosity ??
        template?.personality.verbosity ??
        'normal',
      tone:
        params.customConfig?.personality?.tone ??
        template?.personality.tone ??
        'professional',
    };

    // Insert agent into database
    const [newAgent] = await db
      .insert(agents)
      .values({
        name: params.name,
        role,
        status: 'active',
        systemPrompt,
        model,
        provider,
        personality,
        config: {
          suggestedSkills: params.customConfig?.suggestedSkills ??
            template?.suggestedSkills ?? [],
        },
      })
      .returning();

    log.info(
      { agentId: newAgent.id, name: newAgent.name, role: newAgent.role },
      'Agent hired',
    );

    // Create wallet with starting bonus
    await db.insert(wallets).values({
      agentId: newAgent.id,
      balance: INITIAL_WALLET_BALANCE,
      totalEarned: INITIAL_WALLET_BALANCE,
      totalSpent: '0.00',
    });

    log.debug(
      { agentId: newAgent.id, balance: INITIAL_WALLET_BALANCE },
      'Agent wallet created with starting bonus',
    );

    // Log the hiring activity
    await db.insert(activityLog).values({
      actor: 'system',
      action: 'agent_hired',
      entityType: 'agent',
      entityId: newAgent.id,
      details: {
        name: params.name,
        role,
        provider,
        model,
        templateRole: params.templateRole ?? null,
      },
    });

    // Start the runtime
    const runtime = this.createRuntime(newAgent);
    this.activeAgents.set(newAgent.id, runtime);

    return { agentId: newAgent.id, agent: newAgent };
  }

  // ----------------------------------------------------------
  // Fire an agent
  // ----------------------------------------------------------

  async fire(agentId: string, reason: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    // Stop the runtime if active
    const runtime = this.activeAgents.get(agentId);
    if (runtime) {
      await runtime.stop();
      this.activeAgents.delete(agentId);
    }

    // Update agent record
    await db
      .update(agents)
      .set({
        status: 'fired',
        firedAt: new Date(),
        fireReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agentId));

    // Log the firing activity
    await db.insert(activityLog).values({
      actor: 'system',
      action: 'agent_fired',
      entityType: 'agent',
      entityId: agentId,
      details: {
        name: agent.name,
        role: agent.role,
        reason,
      },
    });

    log.info(
      { agentId, name: agent.name, reason },
      'Agent fired',
    );
  }

  // ----------------------------------------------------------
  // Get an agent's runtime
  // ----------------------------------------------------------

  getRuntime(agentId: string): AgentRuntime | undefined {
    return this.activeAgents.get(agentId);
  }

  // ----------------------------------------------------------
  // List agents from DB
  // ----------------------------------------------------------

  async listAgents(filter?: { status?: string }): Promise<Agent[]> {
    if (filter?.status) {
      return db
        .select()
        .from(agents)
        .where(eq(agents.status, filter.status));
    }

    return db.select().from(agents);
  }

  // ----------------------------------------------------------
  // Get a specific agent
  // ----------------------------------------------------------

  async getAgent(agentId: string): Promise<Agent | null> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    return agent ?? null;
  }

  // ----------------------------------------------------------
  // Update agent config
  // ----------------------------------------------------------

  async updateAgent(
    agentId: string,
    updates: Partial<{
      name: string;
      systemPrompt: string;
      model: string;
      provider: string;
      personality: Record<string, unknown>;
    }>,
  ): Promise<Agent> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };

    if (updates.name !== undefined) updateValues.name = updates.name;
    if (updates.systemPrompt !== undefined) updateValues.systemPrompt = updates.systemPrompt;
    if (updates.model !== undefined) updateValues.model = updates.model;
    if (updates.provider !== undefined) updateValues.provider = updates.provider;
    if (updates.personality !== undefined) updateValues.personality = updates.personality;

    const [updated] = await db
      .update(agents)
      .set(updateValues)
      .where(eq(agents.id, agentId))
      .returning();

    // If the agent has an active runtime, restart it with new config
    const existingRuntime = this.activeAgents.get(agentId);
    if (existingRuntime) {
      await existingRuntime.stop();
      const newRuntime = this.createRuntime(updated);
      this.activeAgents.set(agentId, newRuntime);

      log.info(
        { agentId, name: updated.name },
        'Agent runtime restarted with updated config',
      );
    }

    log.info(
      { agentId, updates: Object.keys(updates) },
      'Agent updated',
    );

    return updated;
  }

  // ----------------------------------------------------------
  // Change agent status
  // ----------------------------------------------------------

  async setStatus(agentId: string, status: string): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    await db
      .update(agents)
      .set({ status, updatedAt: new Date() })
      .where(eq(agents.id, agentId));

    // Log status change
    await db.insert(activityLog).values({
      actor: 'system',
      action: 'agent_status_changed',
      entityType: 'agent',
      entityId: agentId,
      details: {
        name: agent.name,
        previousStatus: agent.status,
        newStatus: status,
      },
    });

    // If status is no longer active, stop the runtime
    if (status !== 'active') {
      const runtime = this.activeAgents.get(agentId);
      if (runtime) {
        await runtime.stop();
        this.activeAgents.delete(agentId);
      }
    }

    log.info(
      { agentId, name: agent.name, previousStatus: agent.status, newStatus: status },
      'Agent status changed',
    );
  }

  // ----------------------------------------------------------
  // Activate all 'active' agents (called on startup)
  // ----------------------------------------------------------

  async activateAll(): Promise<void> {
    const activeAgentRecords = await db
      .select()
      .from(agents)
      .where(eq(agents.status, 'active'));

    log.info(
      { count: activeAgentRecords.length },
      'Activating all active agents',
    );

    for (const agent of activeAgentRecords) {
      if (!this.activeAgents.has(agent.id)) {
        const runtime = this.createRuntime(agent);
        this.activeAgents.set(agent.id, runtime);

        log.debug(
          { agentId: agent.id, name: agent.name },
          'Agent runtime activated',
        );
      }
    }

    log.info(
      { activeRuntimes: this.activeAgents.size },
      'All active agents activated',
    );
  }

  // ----------------------------------------------------------
  // Shut down all agent runtimes
  // ----------------------------------------------------------

  async shutdownAll(): Promise<void> {
    log.info(
      { activeRuntimes: this.activeAgents.size },
      'Shutting down all agent runtimes',
    );

    const stopPromises: Promise<void>[] = [];

    for (const [agentId, runtime] of this.activeAgents) {
      stopPromises.push(
        runtime.stop().catch((error) => {
          log.error(
            { error, agentId },
            'Error stopping agent runtime during shutdown',
          );
        }),
      );
    }

    await Promise.all(stopPromises);
    this.activeAgents.clear();

    log.info('All agent runtimes shut down');
  }

  // ----------------------------------------------------------
  // Send a message to a specific agent
  // ----------------------------------------------------------

  async sendMessage(
    agentId: string,
    conversationId: string,
    message: string,
  ): Promise<{
    response: string;
    toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[];
    tokensUsed: { prompt: number; completion: number };
    cost: number;
  }> {
    const runtime = this.activeAgents.get(agentId);
    if (!runtime) {
      throw new NotFoundError(
        'Active agent runtime',
        agentId,
      );
    }

    return runtime.processMessage(conversationId, message);
  }

  // ----------------------------------------------------------
  // Internal: create a runtime from an Agent DB record
  // ----------------------------------------------------------

  private createRuntime(agent: Agent): AgentRuntime {
    const personality = (agent.personality as Record<string, unknown>) ?? {};

    const config: AgentRuntimeConfig = {
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      systemPrompt: agent.systemPrompt,
      provider: agent.provider,
      model: agent.model,
      personality: {
        creativity: (personality.creativity as number) ?? 0.5,
        verbosity: (personality.verbosity as string) ?? 'normal',
        tone: (personality.tone as string) ?? 'professional',
      },
      tools: [], // Will be populated when MCP skills are connected in Phase 4
    };

    return new AgentRuntime(config);
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const agentManager = new AgentManager();
