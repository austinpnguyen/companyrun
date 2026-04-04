// ============================================================
// Decision Engine — HR department: hiring, firing, warnings
// ============================================================

import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  tasks,
  agents,
  performanceReviews,
  activityLog,
  orchestratorState,
} from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { generateId } from '../shared/utils.js';
import { getBuiltinTemplates } from '../agents/templates.js';

const log = createLogger('orchestrator:decision-engine');

// ============================================================
// Types
// ============================================================

export interface Decision {
  id: string;
  type: 'hire' | 'fire' | 'warn' | 'retrain' | 'promote';
  targetAgentId?: string;
  templateRole?: string;
  reason: string;
  urgency: 'low' | 'medium' | 'high';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
}

// ============================================================
// Constants
// ============================================================

/** Minimum number of unassigned queued tasks before considering a hire */
const HIRE_TASK_THRESHOLD = 3;

/** How long tasks must be unassigned before triggering a hire (ms) */
const HIRE_QUEUE_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/** Maximum age for stale decisions before pruning (24 hours) */
const DEFAULT_STALE_DECISION_MS = 24 * 60 * 60 * 1000;

// ============================================================
// DecisionEngine
// ============================================================

export class DecisionEngine {
  private pendingDecisions: Map<string, Decision> = new Map();

  // ----------------------------------------------------------
  // Analyze company state and generate decisions
  // ----------------------------------------------------------

  async analyze(): Promise<Decision[]> {
    const decisions: Decision[] = [];

    try {
      const hiringDecisions = await this.checkHiringNeeds();
      decisions.push(...hiringDecisions);
    } catch (error) {
      log.error({ error }, 'Error checking hiring needs');
    }

    try {
      const performanceDecisions = await this.checkPerformance();
      decisions.push(...performanceDecisions);
    } catch (error) {
      log.error({ error }, 'Error checking performance');
    }

    // Register new decisions
    for (const decision of decisions) {
      this.pendingDecisions.set(decision.id, decision);
    }

    // Persist pending decisions to orchestrator_state
    if (decisions.length > 0) {
      await this.persistDecisions();
    }

    return decisions;
  }

  // ----------------------------------------------------------
  // Check hiring needs
  // ----------------------------------------------------------

  private async checkHiringNeeds(): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // Find tasks that are queued, unassigned, and have been waiting
    const now = new Date();
    const cutoff = new Date(now.getTime() - HIRE_QUEUE_DELAY_MS);

    const unassignedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'queued'),
          sql`${tasks.assignedAgentId} IS NULL`,
          sql`${tasks.createdAt} < ${cutoff.toISOString()}`,
        ),
      );

    if (unassignedTasks.length < HIRE_TASK_THRESHOLD) {
      return decisions;
    }

    log.info(
      { unassignedCount: unassignedTasks.length, threshold: HIRE_TASK_THRESHOLD },
      'Unassigned task backlog exceeds threshold — considering hire',
    );

    // Check if we already have a pending hire decision
    const existingHire = Array.from(this.pendingDecisions.values()).find(
      (d) => d.type === 'hire' && d.status === 'pending',
    );

    if (existingHire) {
      log.debug('Hire decision already pending — skipping');
      return decisions;
    }

    // Determine the best role to hire
    const recommendedRole = await this.recommendHireRole(unassignedTasks);

    const decision: Decision = {
      id: generateId(),
      type: 'hire',
      templateRole: recommendedRole,
      reason: `${unassignedTasks.length} tasks have been queued for >5 minutes with no available agent. Recommended role: ${recommendedRole}`,
      urgency: unassignedTasks.length > 6 ? 'high' : 'medium',
      status: 'pending',
      createdAt: now,
    };

    decisions.push(decision);

    // Log the decision
    await db.insert(activityLog).values({
      actor: 'orchestrator',
      action: 'decision_created',
      entityType: 'decision',
      details: {
        decisionId: decision.id,
        type: decision.type,
        templateRole: recommendedRole,
        reason: decision.reason,
        urgency: decision.urgency,
      },
    });

    log.info(
      { decisionId: decision.id, role: recommendedRole, urgency: decision.urgency },
      'Hire decision created',
    );

    return decisions;
  }

  // ----------------------------------------------------------
  // Check agent performance (warnings, fires)
  // ----------------------------------------------------------

  private async checkPerformance(): Promise<Decision[]> {
    const decisions: Decision[] = [];

    // Get all active/warning agents
    const activeAgents = await db
      .select()
      .from(agents)
      .where(inArray(agents.status, ['active', 'warning']));

    for (const agent of activeAgents) {
      try {
        // Get last N reviews (N = KPI_FIRE_CONSECUTIVE_REVIEWS)
        const reviews = await db
          .select({ overallScore: performanceReviews.overallScore })
          .from(performanceReviews)
          .where(eq(performanceReviews.agentId, agent.id))
          .orderBy(desc(performanceReviews.reviewedAt))
          .limit(env.KPI_FIRE_CONSECUTIVE_REVIEWS);

        if (reviews.length === 0) continue; // No reviews yet

        const scores = reviews.map((r) => Number(r.overallScore));
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const latestScore = scores[0];

        // Skip if agent already has a pending decision
        const hasPending = Array.from(this.pendingDecisions.values()).some(
          (d) =>
            d.targetAgentId === agent.id &&
            d.status === 'pending' &&
            (d.type === 'fire' || d.type === 'warn'),
        );

        if (hasPending) continue;

        // Check fire threshold: all consecutive reviews below threshold
        if (
          reviews.length >= env.KPI_FIRE_CONSECUTIVE_REVIEWS &&
          scores.every((s) => s < env.KPI_FIRE_THRESHOLD)
        ) {
          const decision: Decision = {
            id: generateId(),
            type: 'fire',
            targetAgentId: agent.id,
            reason: `Agent "${agent.name}" has scored below ${env.KPI_FIRE_THRESHOLD} for ${env.KPI_FIRE_CONSECUTIVE_REVIEWS} consecutive reviews (scores: ${scores.join(', ')}). Recommend termination.`,
            urgency: 'high',
            status: 'pending', // Fires MUST be approved by user
            createdAt: new Date(),
          };

          decisions.push(decision);

          await db.insert(activityLog).values({
            actor: 'orchestrator',
            action: 'decision_created',
            entityType: 'decision',
            details: {
              decisionId: decision.id,
              type: 'fire',
              targetAgentId: agent.id,
              agentName: agent.name,
              scores,
              reason: decision.reason,
            },
          });

          log.warn(
            { agentId: agent.id, agentName: agent.name, scores },
            'Fire recommendation created',
          );

          continue; // Don't also warn if we're recommending fire
        }

        // Check warning threshold
        if (latestScore < env.KPI_WARNING_THRESHOLD) {
          const decision: Decision = {
            id: generateId(),
            type: 'warn',
            targetAgentId: agent.id,
            reason: `Agent "${agent.name}" latest KPI score (${latestScore.toFixed(1)}) is below warning threshold (${env.KPI_WARNING_THRESHOLD}). Average over last ${reviews.length} reviews: ${avgScore.toFixed(1)}.`,
            urgency: avgScore < env.KPI_FIRE_THRESHOLD ? 'high' : 'medium',
            status: 'pending',
            createdAt: new Date(),
          };

          decisions.push(decision);

          await db.insert(activityLog).values({
            actor: 'orchestrator',
            action: 'decision_created',
            entityType: 'decision',
            details: {
              decisionId: decision.id,
              type: 'warn',
              targetAgentId: agent.id,
              agentName: agent.name,
              latestScore,
              avgScore,
              reason: decision.reason,
            },
          });

          log.info(
            { agentId: agent.id, agentName: agent.name, latestScore, avgScore },
            'Warning decision created',
          );
        }
      } catch (error) {
        log.error(
          { error, agentId: agent.id },
          'Error checking agent performance',
        );
      }
    }

    return decisions;
  }

  // ----------------------------------------------------------
  // Recommend which role to hire
  // ----------------------------------------------------------

  private async recommendHireRole(unassignedTasks: { requiredSkills: string[] | null }[]): Promise<string> {
    // Tally required skills across unassigned tasks
    const skillCounts = new Map<string, number>();

    for (const task of unassignedTasks) {
      const requiredSkills = (task.requiredSkills as string[]) ?? [];
      for (const skill of requiredSkills) {
        const normalized = skill.toLowerCase();
        skillCounts.set(normalized, (skillCounts.get(normalized) ?? 0) + 1);
      }
    }

    // Map common skill patterns to template roles
    const roleScores = new Map<string, number>();
    const templates = getBuiltinTemplates();

    for (const template of templates) {
      let score = 0;
      for (const suggested of template.suggestedSkills) {
        const normalized = suggested.toLowerCase();
        score += skillCounts.get(normalized) ?? 0;
      }
      // Also match based on role name in required skills
      score += skillCounts.get(template.role.toLowerCase()) ?? 0;
      roleScores.set(template.role, score);
    }

    // Find the role with the highest match score
    let bestRole = 'developer'; // default fallback
    let bestScore = -1;

    for (const [role, score] of roleScores) {
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    }

    // If no clear winner, check which roles are underrepresented
    if (bestScore <= 0) {
      const activeAgents = await db
        .select({ role: agents.role })
        .from(agents)
        .where(eq(agents.status, 'active'));

      const roleCounts = new Map<string, number>();
      for (const a of activeAgents) {
        roleCounts.set(a.role, (roleCounts.get(a.role) ?? 0) + 1);
      }

      // Find the template role with the fewest active agents
      let minCount = Infinity;
      for (const template of templates) {
        const count = roleCounts.get(template.role) ?? 0;
        if (count < minCount) {
          minCount = count;
          bestRole = template.role;
        }
      }
    }

    return bestRole;
  }

  // ----------------------------------------------------------
  // Get pending decisions
  // ----------------------------------------------------------

  getPendingDecisions(): Decision[] {
    return Array.from(this.pendingDecisions.values()).filter(
      (d) => d.status === 'pending',
    );
  }

  // ----------------------------------------------------------
  // Approve a decision
  // ----------------------------------------------------------

  async approveDecision(decisionId: string): Promise<void> {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    decision.status = 'approved';

    await db.insert(activityLog).values({
      actor: 'user',
      action: 'decision_approved',
      entityType: 'decision',
      details: {
        decisionId: decision.id,
        type: decision.type,
        targetAgentId: decision.targetAgentId,
        templateRole: decision.templateRole,
      },
    });

    await this.persistDecisions();

    log.info(
      { decisionId, type: decision.type },
      'Decision approved',
    );
  }

  // ----------------------------------------------------------
  // Reject a decision
  // ----------------------------------------------------------

  async rejectDecision(decisionId: string): Promise<void> {
    const decision = this.pendingDecisions.get(decisionId);
    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    decision.status = 'rejected';

    await db.insert(activityLog).values({
      actor: 'user',
      action: 'decision_rejected',
      entityType: 'decision',
      details: {
        decisionId: decision.id,
        type: decision.type,
        targetAgentId: decision.targetAgentId,
        templateRole: decision.templateRole,
      },
    });

    await this.persistDecisions();

    log.info(
      { decisionId, type: decision.type },
      'Decision rejected',
    );
  }

  // ----------------------------------------------------------
  // Prune stale decisions
  // ----------------------------------------------------------

  pruneStaleDecisions(maxAgeMs: number = DEFAULT_STALE_DECISION_MS): void {
    const now = Date.now();
    let pruned = 0;

    for (const [id, decision] of this.pendingDecisions) {
      const age = now - decision.createdAt.getTime();
      if (age > maxAgeMs && decision.status !== 'pending') {
        this.pendingDecisions.delete(id);
        pruned++;
      }
    }

    if (pruned > 0) {
      log.debug({ pruned }, 'Pruned stale decisions');
    }
  }

  // ----------------------------------------------------------
  // Load decisions from orchestrator_state on startup
  // ----------------------------------------------------------

  async loadPersistedDecisions(): Promise<void> {
    const [state] = await db
      .select()
      .from(orchestratorState)
      .limit(1);

    if (!state?.pendingDecisions) return;

    const persisted = state.pendingDecisions as unknown[];
    if (!Array.isArray(persisted)) return;

    for (const raw of persisted) {
      const d = raw as Record<string, unknown>;
      if (d.id && typeof d.id === 'string') {
        const decision: Decision = {
          id: d.id as string,
          type: d.type as Decision['type'],
          targetAgentId: d.targetAgentId as string | undefined,
          templateRole: d.templateRole as string | undefined,
          reason: (d.reason as string) ?? '',
          urgency: (d.urgency as Decision['urgency']) ?? 'medium',
          status: (d.status as Decision['status']) ?? 'pending',
          createdAt: new Date(d.createdAt as string),
        };
        this.pendingDecisions.set(decision.id, decision);
      }
    }

    log.info(
      { count: this.pendingDecisions.size },
      'Loaded persisted decisions',
    );
  }

  // ----------------------------------------------------------
  // Persist decisions to orchestrator_state
  // ----------------------------------------------------------

  private async persistDecisions(): Promise<void> {
    const decisionsArray = Array.from(this.pendingDecisions.values());

    // Upsert into orchestrator_state (single row)
    const [existing] = await db
      .select({ id: orchestratorState.id })
      .from(orchestratorState)
      .limit(1);

    if (existing) {
      await db
        .update(orchestratorState)
        .set({
          pendingDecisions: decisionsArray,
          updatedAt: new Date(),
        })
        .where(eq(orchestratorState.id, existing.id));
    }
    // If no row exists, it will be created by the Orchestrator startup
  }
}

// ============================================================
// Singleton
// ============================================================

export const decisionEngine = new DecisionEngine();
