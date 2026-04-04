// ============================================================
// Wage Service — calculates and distributes wages, penalties, bonuses
// ============================================================

import { eq, and, sql, desc, gte } from 'drizzle-orm';
import { db } from '../config/database.js';
import { agents, tasks, transactions } from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import { walletService } from './wallet.js';

const log = createLogger('economy:wages');

// ============================================================
// Types
// ============================================================

export interface WageConfig {
  role: string;
  baseWage: number;
  performanceMultiplier: number;
}

export interface WagePayment {
  agentId: string;
  agentName: string;
  role: string;
  baseWage: number;
  multiplier: number;
  finalAmount: number;
  taskId?: string;
}

// ============================================================
// Priority bonus multipliers
// ============================================================

const PRIORITY_BONUS: Record<string, number> = {
  urgent: 1.5,
  high:   1.2,
  normal: 1.0,
  low:    0.8,
};

// ============================================================
// WageService
// ============================================================

export class WageService {
  // ----------------------------------------------------------
  // Calculate wage for a completed task (pure calculation)
  // ----------------------------------------------------------

  calculateTaskWage(params: {
    baseWage: number;
    kpiScore: number;
    taskComplexity: number;
    taskPriority: string;
  }): number {
    const { baseWage, kpiScore, taskComplexity, taskPriority } = params;

    const performanceMultiplier = kpiScore / 100;
    const priorityBonus = PRIORITY_BONUS[taskPriority] ?? 1.0;

    // Formula: baseWage × (kpiScore / 100) × complexity × priorityBonus
    const wage = baseWage * performanceMultiplier * taskComplexity * priorityBonus;

    // Round to 2 decimal places, ensure minimum of 1 CR
    return Math.max(1, Math.round(wage * 100) / 100);
  }

  // ----------------------------------------------------------
  // Pay an agent for completing a task
  // ----------------------------------------------------------

  async payForTask(
    agentId: string,
    taskId: string,
    params: {
      baseWage: number;
      kpiScore: number;
      taskComplexity: number;
      taskPriority: string;
    },
  ): Promise<WagePayment> {
    const agent = await this.getAgentOrThrow(agentId);

    const finalAmount = this.calculateTaskWage(params);
    const multiplier = (params.kpiScore / 100) * params.taskComplexity * (PRIORITY_BONUS[params.taskPriority] ?? 1.0);

    // Credit the agent's wallet
    await walletService.credit(
      agentId,
      finalAmount,
      'wage',
      `Task completion wage (task ${taskId})`,
      'task',
      taskId,
    );

    const payment: WagePayment = {
      agentId,
      agentName: agent.name,
      role: agent.role,
      baseWage: params.baseWage,
      multiplier: Math.round(multiplier * 100) / 100,
      finalAmount,
      taskId,
    };

    log.info(
      { agentId, taskId, finalAmount, multiplier: payment.multiplier },
      'Agent paid for task completion',
    );

    return payment;
  }

  // ----------------------------------------------------------
  // Apply idle penalties to agents with no completed tasks
  // ----------------------------------------------------------

  async applyIdlePenalties(periodHours?: number): Promise<{ agentId: string; penalty: number }[]> {
    const hours = periodHours ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const penaltyPerHour = env.IDLE_PENALTY_PER_HOUR;

    // Get all active agents
    const activeAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.status, 'active'));

    const results: { agentId: string; penalty: number }[] = [];

    for (const agent of activeAgents) {
      // Check if agent has completed any tasks in the period
      const [completedTask] = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.assignedAgentId, agent.id),
            eq(tasks.status, 'completed'),
            gte(tasks.completedAt, since),
          ),
        )
        .limit(1);

      if (!completedTask) {
        // Agent is idle — calculate penalty
        const penalty = Math.round(penaltyPerHour * hours * 100) / 100;

        if (penalty > 0) {
          try {
            await walletService.debit(
              agent.id,
              penalty,
              'penalty',
              `Idle penalty: ${hours}h with no completed tasks`,
            );

            results.push({ agentId: agent.id, penalty });

            log.debug(
              { agentId: agent.id, penalty, hours },
              'Idle penalty applied',
            );
          } catch (error) {
            // Skip if wallet not found (shouldn't happen for active agents)
            log.warn(
              { agentId: agent.id, error },
              'Failed to apply idle penalty',
            );
          }
        }
      }
    }

    if (results.length > 0) {
      log.info(
        { penalizedCount: results.length, periodHours: hours },
        'Idle penalties applied',
      );
    }

    return results;
  }

  // ----------------------------------------------------------
  // Apply bonus for hitting KPI targets
  // ----------------------------------------------------------

  async applyKPIBonus(agentId: string, kpiScore: number): Promise<number | null> {
    if (kpiScore <= 80) {
      return null; // No bonus if KPI <= 80
    }

    const bonus = 20; // +20 CR for KPI > 80

    await walletService.credit(
      agentId,
      bonus,
      'bonus',
      `KPI performance bonus (score: ${kpiScore})`,
    );

    log.info(
      { agentId, kpiScore, bonus },
      'KPI bonus applied',
    );

    return bonus;
  }

  // ----------------------------------------------------------
  // Apply penalty for failed task
  // ----------------------------------------------------------

  async applyTaskFailurePenalty(agentId: string, taskId: string): Promise<number> {
    const penalty = 5; // -5 CR

    await walletService.debit(
      agentId,
      penalty,
      'penalty',
      `Task failure penalty (task ${taskId})`,
      'task',
      taskId,
    );

    log.info(
      { agentId, taskId, penalty },
      'Task failure penalty applied',
    );

    return penalty;
  }

  // ----------------------------------------------------------
  // Apply bonus for learning a new skill
  // ----------------------------------------------------------

  async applySkillLearningBonus(agentId: string, skillName: string): Promise<number> {
    const bonus = 15; // +15 CR

    await walletService.credit(
      agentId,
      bonus,
      'bonus',
      `Skill learning bonus: ${skillName}`,
    );

    log.info(
      { agentId, skillName, bonus },
      'Skill learning bonus applied',
    );

    return bonus;
  }

  // ----------------------------------------------------------
  // Get wage history for an agent
  // ----------------------------------------------------------

  async getWageHistory(agentId: string, since?: Date): Promise<WagePayment[]> {
    const agent = await this.getAgentOrThrow(agentId);

    const wallet = await walletService.getWallet(agentId);
    if (!wallet) {
      return [];
    }

    const conditions = [
      eq(transactions.walletId, wallet.id),
      eq(transactions.type, 'wage'),
    ];

    if (since) {
      conditions.push(
        sql`${transactions.createdAt} >= ${since.toISOString()}`,
      );
    }

    const wageTxs = await db
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.createdAt));

    return wageTxs.map((tx) => ({
      agentId,
      agentName: agent.name,
      role: agent.role,
      baseWage: 0, // Original base wage not stored in transaction
      multiplier: 0, // Multiplier not stored in transaction
      finalAmount: Math.abs(parseFloat(tx.amount)),
      taskId: tx.referenceType === 'task' ? (tx.referenceId ?? undefined) : undefined,
    }));
  }

  // ----------------------------------------------------------
  // Internal: get agent or throw NotFoundError
  // ----------------------------------------------------------

  private async getAgentOrThrow(agentId: string) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    return agent;
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const wageService = new WageService();
