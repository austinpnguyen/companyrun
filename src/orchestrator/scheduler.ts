// ============================================================
// Task Scheduler — matches tasks to agents by skill, workload, KPI
// ============================================================

import { eq, and, inArray, sql, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  tasks,
  agents,
  agentSkills,
  skills,
  performanceReviews,
} from '../db/schema.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('orchestrator:scheduler');

// ============================================================
// Types
// ============================================================

export interface SchedulerResult {
  taskId: string;
  assignedAgentId: string;
  reason: string;
}

// ============================================================
// TaskScheduler
// ============================================================

export class TaskScheduler {
  // ----------------------------------------------------------
  // Find the best agent for a given task
  // ----------------------------------------------------------

  async findBestAgent(task: {
    id: string;
    requiredSkills: string[];
    priority: string;
    complexity: number;
  }): Promise<{ agentId: string; score: number; reason: string } | null> {
    // Get all active agents
    const activeAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.status, 'active'));

    if (activeAgents.length === 0) {
      log.warn('No active agents available for task assignment');
      return null;
    }

    // Get workloads (in-progress tasks per agent)
    const workloads = await this.getAgentWorkloads();

    // Score each agent
    let bestCandidate: { agentId: string; score: number; reason: string } | null = null;

    for (const agent of activeAgents) {
      const skillMatch = await this.calculateSkillMatch(agent.id, task.requiredSkills);
      const currentTasks = workloads.get(agent.id) ?? 0;
      const kpiScore = await this.getLatestKpiScore(agent.id);

      const score = this.calculateAssignmentScore({
        skillMatch,
        currentTasks,
        kpiScore,
        priority: task.priority,
      });

      log.debug(
        {
          agentId: agent.id,
          agentName: agent.name,
          skillMatch,
          currentTasks,
          kpiScore,
          score,
        },
        'Agent scored for task',
      );

      if (bestCandidate === null || score > bestCandidate.score) {
        const reasons: string[] = [];
        if (skillMatch > 0) reasons.push(`${(skillMatch * 100).toFixed(0)}% skill match`);
        if (currentTasks === 0) reasons.push('no current tasks');
        else reasons.push(`${currentTasks} current task(s)`);
        if (kpiScore > 0) reasons.push(`KPI: ${kpiScore.toFixed(0)}`);

        bestCandidate = {
          agentId: agent.id,
          score,
          reason: `Best match: ${agent.name} — ${reasons.join(', ')}`,
        };
      }
    }

    // Only assign if score meets a minimum threshold
    if (bestCandidate && bestCandidate.score < 0.05) {
      log.info(
        { taskId: task.id, bestScore: bestCandidate.score },
        'No agent scored high enough for task assignment',
      );
      return null;
    }

    return bestCandidate;
  }

  // ----------------------------------------------------------
  // Schedule all queued tasks
  // ----------------------------------------------------------

  async scheduleQueuedTasks(): Promise<SchedulerResult[]> {
    // Fetch tasks in 'queued' status with no assigned agent
    const queuedTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'queued'),
          sql`${tasks.assignedAgentId} IS NULL`,
        ),
      );

    if (queuedTasks.length === 0) {
      return [];
    }

    log.info({ count: queuedTasks.length }, 'Scheduling queued tasks');

    const results: SchedulerResult[] = [];

    for (const task of queuedTasks) {
      try {
        const best = await this.findBestAgent({
          id: task.id,
          requiredSkills: (task.requiredSkills as string[]) ?? [],
          priority: task.priority ?? 'normal',
          complexity: task.complexity ?? 1,
        });

        if (!best) {
          log.debug({ taskId: task.id, title: task.title }, 'No suitable agent found — task remains queued');
          continue;
        }

        // Assign the task
        await db
          .update(tasks)
          .set({
            assignedAgentId: best.agentId,
            status: 'assigned',
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, task.id));

        results.push({
          taskId: task.id,
          assignedAgentId: best.agentId,
          reason: best.reason,
        });

        log.info(
          { taskId: task.id, agentId: best.agentId, reason: best.reason },
          'Task assigned to agent',
        );
      } catch (error) {
        log.error(
          { error, taskId: task.id },
          'Error scheduling task',
        );
      }
    }

    return results;
  }

  // ----------------------------------------------------------
  // Get current workload per agent
  // ----------------------------------------------------------

  async getAgentWorkloads(): Promise<Map<string, number>> {
    const rows = await db
      .select({
        agentId: tasks.assignedAgentId,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        inArray(tasks.status, ['assigned', 'in_progress']),
      )
      .groupBy(tasks.assignedAgentId);

    const workloads = new Map<string, number>();
    for (const row of rows) {
      if (row.agentId) {
        workloads.set(row.agentId, row.count);
      }
    }

    return workloads;
  }

  // ----------------------------------------------------------
  // Check if an agent has the required skills
  // ----------------------------------------------------------

  async agentHasSkills(agentId: string, requiredSkills: string[]): Promise<boolean> {
    if (requiredSkills.length === 0) return true;

    const match = await this.calculateSkillMatch(agentId, requiredSkills);
    return match >= 1.0;
  }

  // ----------------------------------------------------------
  // Calculate skill match ratio (0-1)
  // ----------------------------------------------------------

  private async calculateSkillMatch(agentId: string, requiredSkills: string[]): Promise<number> {
    if (requiredSkills.length === 0) return 1.0; // No skills required → perfect match

    // Get agent's skill names via join
    const agentSkillRows = await db
      .select({ skillName: skills.name })
      .from(agentSkills)
      .innerJoin(skills, eq(agentSkills.skillId, skills.id))
      .where(eq(agentSkills.agentId, agentId));

    const agentSkillNames = new Set(
      agentSkillRows.map((r) => r.skillName.toLowerCase()),
    );

    // Also check the agent's config.suggestedSkills as a fallback
    const [agentRecord] = await db
      .select({ config: agents.config })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (agentRecord?.config && typeof agentRecord.config === 'object') {
      const cfg = agentRecord.config as Record<string, unknown>;
      const suggested = cfg.suggestedSkills;
      if (Array.isArray(suggested)) {
        for (const s of suggested) {
          if (typeof s === 'string') agentSkillNames.add(s.toLowerCase());
        }
      }
    }

    let matched = 0;
    for (const skill of requiredSkills) {
      if (agentSkillNames.has(skill.toLowerCase())) {
        matched++;
      }
    }

    return matched / requiredSkills.length;
  }

  // ----------------------------------------------------------
  // Get latest KPI score for an agent (from performance_reviews)
  // ----------------------------------------------------------

  private async getLatestKpiScore(agentId: string): Promise<number> {
    const [review] = await db
      .select({ overallScore: performanceReviews.overallScore })
      .from(performanceReviews)
      .where(eq(performanceReviews.agentId, agentId))
      .orderBy(desc(performanceReviews.reviewedAt))
      .limit(1);

    // Default score for agents with no reviews
    return review ? Number(review.overallScore) : 50;
  }

  // ----------------------------------------------------------
  // Calculate assignment score (higher = better match)
  // ----------------------------------------------------------

  private calculateAssignmentScore(params: {
    skillMatch: number;      // 0-1
    currentTasks: number;    // fewer = higher score
    kpiScore: number;        // from performance_reviews (0-100)
    priority: string;        // urgent tasks prefer agents with fewer tasks
  }): number {
    // Weight factors
    const SKILL_WEIGHT = 0.40;
    const WORKLOAD_WEIGHT = 0.30;
    const KPI_WEIGHT = 0.20;
    const PRIORITY_WEIGHT = 0.10;

    // Skill component (0-1)
    const skillComponent = params.skillMatch;

    // Workload component (0-1): fewer tasks → higher score
    // An agent with 0 tasks gets 1.0; each additional task drops score
    const workloadComponent = Math.max(0, 1 - params.currentTasks * 0.25);

    // KPI component (0-1): normalize from 0-100 range
    const kpiComponent = Math.min(1, Math.max(0, params.kpiScore / 100));

    // Priority bonus: for urgent tasks, heavily penalize agents with many tasks
    let priorityComponent = 0.5; // neutral
    if (params.priority === 'urgent') {
      priorityComponent = params.currentTasks === 0 ? 1.0 : 0.1;
    } else if (params.priority === 'high') {
      priorityComponent = params.currentTasks <= 1 ? 0.8 : 0.3;
    } else if (params.priority === 'low') {
      priorityComponent = 0.5; // don't care about workload for low priority
    }

    const score =
      SKILL_WEIGHT * skillComponent +
      WORKLOAD_WEIGHT * workloadComponent +
      KPI_WEIGHT * kpiComponent +
      PRIORITY_WEIGHT * priorityComponent;

    return score;
  }
}

// ============================================================
// Singleton
// ============================================================

export const taskScheduler = new TaskScheduler();
