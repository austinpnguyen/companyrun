// ============================================================
// Report Service — financial reporting for dashboard/orchestrator
// ============================================================

import { eq, sql, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import { wallets, transactions, agents, company, llmUsage } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';

const log = createLogger('economy:reports');

// ============================================================
// Types
// ============================================================

export interface FinancialReport {
  period: { start: Date; end: Date };
  summary: {
    totalEarnings: number;
    totalPenalties: number;
    totalBonuses: number;
    netFlow: number;
    llmCosts: number;
  };
  topEarners: { agentId: string; name: string; earned: number }[];
  topSpenders: { agentId: string; name: string; spent: number }[];
  transactionCounts: Record<string, number>;
  budgetUtilization: number;
}

// ============================================================
// ReportService
// ============================================================

export class ReportService {
  // ----------------------------------------------------------
  // Generate a daily report
  // ----------------------------------------------------------

  async generateDailyReport(date?: Date): Promise<FinancialReport> {
    const targetDate = date ?? new Date();

    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    return this.generateReport(start, end);
  }

  // ----------------------------------------------------------
  // Generate a weekly report
  // ----------------------------------------------------------

  async generateWeeklyReport(weekStart?: Date): Promise<FinancialReport> {
    const start = weekStart ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);

    return this.generateReport(start, end);
  }

  // ----------------------------------------------------------
  // Generate a report for a custom period
  // ----------------------------------------------------------

  async generateReport(startDate: Date, endDate: Date): Promise<FinancialReport> {
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Earnings (positive wage/earning/bonus transactions)
    const [earningsResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.type} IN ('earning', 'wage', 'bonus')
            AND ${transactions.amount}::numeric > 0
            AND ${transactions.createdAt} >= ${startIso}
            AND ${transactions.createdAt} <= ${endIso}`,
      );

    // Penalties
    const [penaltiesResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(ABS(${transactions.amount}::numeric)), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.type} = 'penalty'
            AND ${transactions.createdAt} >= ${startIso}
            AND ${transactions.createdAt} <= ${endIso}`,
      );

    // Bonuses specifically
    const [bonusesResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .where(
        sql`${transactions.type} = 'bonus'
            AND ${transactions.amount}::numeric > 0
            AND ${transactions.createdAt} >= ${startIso}
            AND ${transactions.createdAt} <= ${endIso}`,
      );

    // LLM costs
    const [llmCostsResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${llmUsage.costUsd}::numeric), 0)`,
      })
      .from(llmUsage)
      .where(
        sql`${llmUsage.createdAt} >= ${startIso} AND ${llmUsage.createdAt} <= ${endIso}`,
      );

    const totalEarnings = parseFloat(earningsResult?.total ?? '0');
    const totalPenalties = parseFloat(penaltiesResult?.total ?? '0');
    const totalBonuses = parseFloat(bonusesResult?.total ?? '0');
    const llmCosts = parseFloat(llmCostsResult?.total ?? '0');
    const netFlow = totalEarnings - totalPenalties;

    // Top earners in the period
    const topEarners = await db
      .select({
        agentId: wallets.agentId,
        name: agents.name,
        earned: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
      })
      .from(transactions)
      .innerJoin(wallets, eq(transactions.walletId, wallets.id))
      .innerJoin(agents, eq(wallets.agentId, agents.id))
      .where(
        sql`${transactions.amount}::numeric > 0
            AND ${transactions.createdAt} >= ${startIso}
            AND ${transactions.createdAt} <= ${endIso}`,
      )
      .groupBy(wallets.agentId, agents.name)
      .orderBy(sql`SUM(${transactions.amount}::numeric) DESC`)
      .limit(5);

    // Top spenders (most penalties/debits)
    const topSpenders = await db
      .select({
        agentId: wallets.agentId,
        name: agents.name,
        spent: sql<string>`COALESCE(SUM(ABS(${transactions.amount}::numeric)), 0)`,
      })
      .from(transactions)
      .innerJoin(wallets, eq(transactions.walletId, wallets.id))
      .innerJoin(agents, eq(wallets.agentId, agents.id))
      .where(
        sql`${transactions.amount}::numeric < 0
            AND ${transactions.createdAt} >= ${startIso}
            AND ${transactions.createdAt} <= ${endIso}`,
      )
      .groupBy(wallets.agentId, agents.name)
      .orderBy(sql`SUM(ABS(${transactions.amount}::numeric)) DESC`)
      .limit(5);

    // Transaction counts by type
    const typeCounts = await db
      .select({
        type: transactions.type,
        cnt: count(),
      })
      .from(transactions)
      .where(
        sql`${transactions.createdAt} >= ${startIso} AND ${transactions.createdAt} <= ${endIso}`,
      )
      .groupBy(transactions.type);

    const transactionCounts: Record<string, number> = {};
    for (const row of typeCounts) {
      transactionCounts[row.type] = row.cnt;
    }

    // Budget utilization
    const [companyRow] = await db.select().from(company).limit(1);
    const budgetTotal = companyRow ? parseFloat(companyRow.budgetTotal ?? '0') : 0;
    const budgetRemaining = companyRow ? parseFloat(companyRow.budgetRemaining ?? '0') : 0;
    const budgetUtilization = budgetTotal > 0
      ? Math.round(((budgetTotal - budgetRemaining) / budgetTotal) * 10000) / 100
      : 0;

    const report: FinancialReport = {
      period: { start: startDate, end: endDate },
      summary: {
        totalEarnings,
        totalPenalties,
        totalBonuses,
        netFlow,
        llmCosts,
      },
      topEarners: topEarners.map((r) => ({
        agentId: r.agentId,
        name: r.name,
        earned: parseFloat(r.earned),
      })),
      topSpenders: topSpenders.map((r) => ({
        agentId: r.agentId,
        name: r.name,
        spent: parseFloat(r.spent),
      })),
      transactionCounts,
      budgetUtilization,
    };

    log.info(
      {
        periodStart: startDate.toISOString(),
        periodEnd: endDate.toISOString(),
        netFlow,
        txCount: Object.values(transactionCounts).reduce((a, b) => a + b, 0),
      },
      'Financial report generated',
    );

    return report;
  }

  // ----------------------------------------------------------
  // Per-agent financial summary
  // ----------------------------------------------------------

  async getAgentFinancialSummary(
    agentId: string,
    since?: Date,
  ): Promise<{
    earnings: number;
    penalties: number;
    bonuses: number;
    wages: number;
    netIncome: number;
    transactionCount: number;
  }> {
    const wallet = await db
      .select()
      .from(wallets)
      .where(eq(wallets.agentId, agentId))
      .limit(1)
      .then((rows) => rows[0]);

    if (!wallet) {
      throw new NotFoundError('Wallet for agent', agentId);
    }

    const sinceDate = since ?? new Date(0); // all time if not specified
    const sinceIso = sinceDate.toISOString();

    // Aggregate by type
    const typeAggregates = await db
      .select({
        type: transactions.type,
        total: sql<string>`COALESCE(SUM(${transactions.amount}::numeric), 0)`,
        cnt: count(),
      })
      .from(transactions)
      .where(
        sql`${transactions.walletId} = ${wallet.id}
            AND ${transactions.createdAt} >= ${sinceIso}`,
      )
      .groupBy(transactions.type);

    let earnings = 0;
    let penalties = 0;
    let bonuses = 0;
    let wages = 0;
    let transactionCount = 0;

    for (const row of typeAggregates) {
      const total = parseFloat(row.total);
      transactionCount += row.cnt;

      switch (row.type) {
        case 'earning':
          earnings += total;
          break;
        case 'penalty':
          penalties += Math.abs(total);
          break;
        case 'bonus':
          bonuses += total;
          break;
        case 'wage':
          wages += total;
          break;
        // transfer and expense are not included in net income categories
      }
    }

    const netIncome = earnings + wages + bonuses - penalties;

    return {
      earnings,
      penalties,
      bonuses,
      wages,
      netIncome: Math.round(netIncome * 100) / 100,
      transactionCount,
    };
  }

  // ----------------------------------------------------------
  // Generate a text summary (for orchestrator to read/report)
  // ----------------------------------------------------------

  generateTextSummary(report: FinancialReport): string {
    const { summary, topEarners, topSpenders, transactionCounts, budgetUtilization, period } = report;

    const lines: string[] = [
      `📊 Financial Report`,
      `Period: ${period.start.toLocaleDateString()} — ${period.end.toLocaleDateString()}`,
      ``,
      `💰 Summary:`,
      `  Earnings:  ${summary.totalEarnings.toFixed(2)} CR`,
      `  Bonuses:   ${summary.totalBonuses.toFixed(2)} CR`,
      `  Penalties: ${summary.totalPenalties.toFixed(2)} CR`,
      `  Net Flow:  ${summary.netFlow.toFixed(2)} CR`,
      `  LLM Costs: $${summary.llmCosts.toFixed(4)} USD`,
      ``,
      `📈 Budget Utilization: ${budgetUtilization.toFixed(1)}%`,
      ``,
    ];

    if (topEarners.length > 0) {
      lines.push(`🏆 Top Earners:`);
      for (const earner of topEarners) {
        lines.push(`  • ${earner.name}: ${earner.earned.toFixed(2)} CR`);
      }
      lines.push(``);
    }

    if (topSpenders.length > 0) {
      lines.push(`⚠️ Highest Penalties:`);
      for (const spender of topSpenders) {
        lines.push(`  • ${spender.name}: ${spender.spent.toFixed(2)} CR`);
      }
      lines.push(``);
    }

    const totalTxCount = Object.values(transactionCounts).reduce((a, b) => a + b, 0);
    lines.push(`📋 Transactions: ${totalTxCount} total`);
    for (const [type, cnt] of Object.entries(transactionCounts)) {
      lines.push(`  • ${type}: ${cnt}`);
    }

    return lines.join('\n');
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const reportService = new ReportService();
