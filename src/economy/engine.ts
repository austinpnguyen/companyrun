// ============================================================
// Economy Engine — company budget management + financial health
// ============================================================

import { eq, sql, gte, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import { company, wallets, transactions, agents, tasks, llmUsage, activityLog } from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';

const log = createLogger('economy:engine');

// ============================================================
// Types
// ============================================================

export interface EconomyOverview {
  companyBudget: {
    total: number;
    remaining: number;
    spent: number;
  };
  agents: {
    totalAgents: number;
    totalEarnings: number;
    totalPenalties: number;
    averageBalance: number;
  };
  period: {
    earningsThisPeriod: number;
    expensesThisPeriod: number;
    llmCostsThisPeriod: number;
  };
}

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  role: string;
  balance: number;
  totalEarned: number;
  tasksCompleted: number;
}

// ============================================================
// EconomyEngine
// ============================================================

export class EconomyEngine {
  // ----------------------------------------------------------
  // Get full economy overview
  // ----------------------------------------------------------

  async getOverview(periodDays?: number): Promise<EconomyOverview> {
    const days = periodDays ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get company budget
    const [companyRow] = await db.select().from(company).limit(1);
    const budgetTotal = companyRow ? parseFloat(companyRow.budgetTotal ?? '0') : env.INITIAL_COMPANY_BUDGET;
    const budgetRemaining = companyRow ? parseFloat(companyRow.budgetRemaining ?? '0') : env.INITIAL_COMPANY_BUDGET;

    // Get active agent count
    const [agentCount] = await db
      .select({ value: count() })
      .from(agents)
      .where(eq(agents.status, 'active'));

    // Get aggregate wallet stats
    const [walletStats] = await db
      .select({
        totalEarned: sql<string>`COALESCE(SUM(${wallets.totalEarned}::numeric), 0)`,
        totalBalance: sql<string>`COALESCE(SUM(${wallets.balance}::numeric), 0)`,
      })
      .from(wallets);

    const totalEarnings = parseFloat(walletStats?.totalEarned ?? '0');
    const totalBalance = parseFloat(walletStats?.totalBalance ?? '0');
    const totalAgents = agentCount?.value ?? 0;
    const averageBalance = totalAgents > 0 ? totalBalance / totalAgents : 0;

    // Get penalties total from transactions
    const [penaltyStats] = await db
      .select({
        total: sql<string>`COALESCE(SUM(ABS(${transactions.amount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(eq(transactions.type, 'penalty'));

    const totalPenalties = parseFloat(penaltyStats?.total ?? '0');

    // Get period stats from transactions
    const [periodEarnings] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.amount}::numeric > 0 AND ${transactions.createdAt} >= ${since.toISOString()}`,
      );

    const [periodExpenses] = await db
      .select({
        total: sql<string>`COALESCE(SUM(ABS(${transactions.amount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.amount}::numeric < 0 AND ${transactions.createdAt} >= ${since.toISOString()}`,
      );

    // Get LLM costs for period
    const [llmCosts] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${llmUsage.costUsd}::numeric), 0)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since));

    return {
      companyBudget: {
        total: budgetTotal,
        remaining: budgetRemaining,
        spent: budgetTotal - budgetRemaining,
      },
      agents: {
        totalAgents,
        totalEarnings,
        totalPenalties,
        averageBalance: Math.round(averageBalance * 100) / 100,
      },
      period: {
        earningsThisPeriod: parseFloat(periodEarnings?.total ?? '0'),
        expensesThisPeriod: parseFloat(periodExpenses?.total ?? '0'),
        llmCostsThisPeriod: parseFloat(llmCosts?.total ?? '0'),
      },
    };
  }

  // ----------------------------------------------------------
  // Get leaderboard (top earners)
  // ----------------------------------------------------------

  async getLeaderboard(limit?: number): Promise<LeaderboardEntry[]> {
    const maxEntries = limit ?? 10;

    // Join wallets with agents + count completed tasks
    const rows = await db
      .select({
        agentId: agents.id,
        agentName: agents.name,
        role: agents.role,
        balance: wallets.balance,
        totalEarned: wallets.totalEarned,
        tasksCompleted: sql<number>`(
          SELECT COUNT(*) FROM tasks
          WHERE tasks.assigned_agent_id = ${agents.id}
          AND tasks.status = 'completed'
        )`,
      })
      .from(agents)
      .innerJoin(wallets, eq(wallets.agentId, agents.id))
      .where(eq(agents.status, 'active'))
      .orderBy(sql`${wallets.totalEarned}::numeric DESC`)
      .limit(maxEntries);

    return rows.map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      role: row.role,
      balance: parseFloat(row.balance ?? '0'),
      totalEarned: parseFloat(row.totalEarned ?? '0'),
      tasksCompleted: Number(row.tasksCompleted),
    }));
  }

  // ----------------------------------------------------------
  // Update company budget
  // ----------------------------------------------------------

  async updateBudget(newTotal: number): Promise<void> {
    if (newTotal < 0) {
      throw new ValidationError('Budget cannot be negative');
    }

    const [companyRow] = await db.select().from(company).limit(1);

    if (!companyRow) {
      // Create company row if it doesn't exist
      await db.insert(company).values({
        budgetTotal: newTotal.toFixed(2),
        budgetRemaining: newTotal.toFixed(2),
      });
    } else {
      const currentTotal = parseFloat(companyRow.budgetTotal ?? '0');
      const currentRemaining = parseFloat(companyRow.budgetRemaining ?? '0');
      const difference = newTotal - currentTotal;
      const newRemaining = currentRemaining + difference;

      await db
        .update(company)
        .set({
          budgetTotal: newTotal.toFixed(2),
          budgetRemaining: Math.max(0, newRemaining).toFixed(2),
          updatedAt: new Date(),
        })
        .where(eq(company.id, companyRow.id));
    }

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'budget_updated',
      entityType: 'company',
      details: { newTotal },
    });

    log.info({ newTotal }, 'Company budget updated');
  }

  // ----------------------------------------------------------
  // Deduct from company budget
  // ----------------------------------------------------------

  async deductFromBudget(amount: number, reason: string): Promise<number> {
    if (amount <= 0) {
      throw new ValidationError('Deduction amount must be positive');
    }

    const [companyRow] = await db.select().from(company).limit(1);
    if (!companyRow) {
      throw new NotFoundError('Company');
    }

    const remaining = parseFloat(companyRow.budgetRemaining ?? '0');
    const newRemaining = remaining - amount;

    await db
      .update(company)
      .set({
        budgetRemaining: newRemaining.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(company.id, companyRow.id));

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'budget_deducted',
      entityType: 'company',
      details: { amount, reason, remainingAfter: newRemaining },
    });

    log.debug({ amount, reason, remaining: newRemaining }, 'Budget deducted');

    return newRemaining;
  }

  // ----------------------------------------------------------
  // Add to company budget
  // ----------------------------------------------------------

  async addToBudget(amount: number, reason: string): Promise<number> {
    if (amount <= 0) {
      throw new ValidationError('Addition amount must be positive');
    }

    const [companyRow] = await db.select().from(company).limit(1);
    if (!companyRow) {
      throw new NotFoundError('Company');
    }

    const remaining = parseFloat(companyRow.budgetRemaining ?? '0');
    const newRemaining = remaining + amount;

    await db
      .update(company)
      .set({
        budgetRemaining: newRemaining.toFixed(2),
        updatedAt: new Date(),
      })
      .where(eq(company.id, companyRow.id));

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'budget_added',
      entityType: 'company',
      details: { amount, reason, remainingAfter: newRemaining },
    });

    log.debug({ amount, reason, remaining: newRemaining }, 'Budget added');

    return newRemaining;
  }

  // ----------------------------------------------------------
  // Check if company can afford an action
  // ----------------------------------------------------------

  async canAfford(amount: number): Promise<boolean> {
    const [companyRow] = await db.select().from(company).limit(1);
    if (!companyRow) {
      return false;
    }

    const remaining = parseFloat(companyRow.budgetRemaining ?? '0');
    return remaining >= amount;
  }

  // ----------------------------------------------------------
  // Get spending breakdown by category
  // ----------------------------------------------------------

  async getSpendingBreakdown(since?: Date): Promise<Record<string, number>> {
    const sinceDate = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default 30 days

    const rows = await db
      .select({
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(ABS(${transactions.amount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(gte(transactions.createdAt, sinceDate))
      .groupBy(transactions.type);

    const breakdown: Record<string, number> = {};
    for (const row of rows) {
      breakdown[row.type] = parseFloat(row.total);
    }

    return breakdown;
  }

  // ----------------------------------------------------------
  // Get cost efficiency metrics
  // ----------------------------------------------------------

  async getCostEfficiency(since?: Date): Promise<{
    totalCreditsDistributed: number;
    totalLLMCost: number;
    tasksCompleted: number;
    costPerTask: number;
  }> {
    const sinceDate = since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Total credits distributed (positive transactions)
    const [creditStats] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.amount}::numeric > 0 AND ${transactions.createdAt} >= ${sinceDate.toISOString()}`,
      );

    // Total LLM cost
    const [llmCostStats] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${llmUsage.costUsd}::numeric), 0)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, sinceDate));

    // Tasks completed in period
    const [taskStats] = await db
      .select({ value: count() })
      .from(tasks)
      .where(
        sql`${tasks.status} = 'completed' AND ${tasks.completedAt} >= ${sinceDate.toISOString()}`,
      );

    const totalCreditsDistributed = parseFloat(creditStats?.total ?? '0');
    const totalLLMCost = parseFloat(llmCostStats?.total ?? '0');
    const tasksCompleted = taskStats?.value ?? 0;
    const totalCost = totalCreditsDistributed + totalLLMCost;
    const costPerTask = tasksCompleted > 0 ? Math.round((totalCost / tasksCompleted) * 100) / 100 : 0;

    return {
      totalCreditsDistributed,
      totalLLMCost,
      tasksCompleted,
      costPerTask,
    };
  }

  // ----------------------------------------------------------
  // Financial health check
  // ----------------------------------------------------------

  async healthCheck(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    budgetRunway: number;
    recommendations: string[];
  }> {
    const recommendations: string[] = [];

    // Get company budget
    const [companyRow] = await db.select().from(company).limit(1);
    const budgetTotal = companyRow ? parseFloat(companyRow.budgetTotal ?? '0') : env.INITIAL_COMPANY_BUDGET;
    const budgetRemaining = companyRow ? parseFloat(companyRow.budgetRemaining ?? '0') : env.INITIAL_COMPANY_BUDGET;

    // Calculate daily spend rate (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [weeklySpend] = await db
      .select({
        total: sql<string>`COALESCE(SUM(ABS(${transactions.amount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.amount}::numeric < 0 AND ${transactions.createdAt} >= ${sevenDaysAgo.toISOString()}`,
      );

    const totalWeeklySpend = parseFloat(weeklySpend?.total ?? '0');
    const dailySpendRate = totalWeeklySpend / 7;

    // Calculate runway
    const budgetRunway = dailySpendRate > 0
      ? Math.round(budgetRemaining / dailySpendRate)
      : budgetRemaining > 0 ? 999 : 0;

    // Determine status
    let status: 'healthy' | 'warning' | 'critical';
    const utilizationPercent = budgetTotal > 0
      ? ((budgetTotal - budgetRemaining) / budgetTotal) * 100
      : 0;

    if (budgetRemaining <= 0 || budgetRunway <= 3) {
      status = 'critical';
      recommendations.push('Budget is critically low. Consider adding funds immediately.');
    } else if (budgetRunway <= 14 || utilizationPercent > 80) {
      status = 'warning';
      recommendations.push('Budget utilization is high. Review spending or increase budget.');
    } else {
      status = 'healthy';
    }

    // Check for high penalty rates
    const [penaltyCount] = await db
      .select({ value: count() })
      .from(transactions)
      .where(
        sql`${transactions.type} = 'penalty' AND ${transactions.createdAt} >= ${sevenDaysAgo.toISOString()}`,
      );

    if ((penaltyCount?.value ?? 0) > 10) {
      recommendations.push('High number of penalties this week. Review agent performance or task assignments.');
    }

    // Check for idle agents (no earnings this week)
    const [activeCount] = await db
      .select({ value: count() })
      .from(agents)
      .where(eq(agents.status, 'active'));

    if ((activeCount?.value ?? 0) > 0) {
      const [earningAgents] = await db
        .select({
          value: sql<number>`COUNT(DISTINCT ${wallets.agentId})`,
        })
        .from(transactions)
        .innerJoin(wallets, eq(transactions.walletId, wallets.id))
        .where(
          sql`${transactions.type} = 'wage' AND ${transactions.createdAt} >= ${sevenDaysAgo.toISOString()}`,
        );

      const earningCount = Number(earningAgents?.value ?? 0);
      const activeTotal = activeCount?.value ?? 0;

      if (earningCount < activeTotal * 0.5) {
        recommendations.push(`Only ${earningCount}/${activeTotal} agents earned wages this week. Consider reassigning idle agents.`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Economy is running efficiently.');
    }

    log.info(
      { status, budgetRunway, dailySpendRate },
      'Health check completed',
    );

    return { status, budgetRunway, recommendations };
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const economyEngine = new EconomyEngine();
