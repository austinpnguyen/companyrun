// ============================================================
// Metric Collection — collects and stores raw KPI data points
// ============================================================

import { eq, and, sql, desc, gte, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import {
  kpiMetrics,
  tasks,
  agentSkills,
  llmUsage,
  activityLog,
  performanceReviews,
} from '../db/schema.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('kpi:metrics');

// ============================================================
// Types
// ============================================================

/** Definition of a measurable KPI metric */
export interface MetricDefinition {
  name: string;
  weight: number;
  description: string;
  unit: string;
  higherIsBetter: boolean;
  calculate: (agentId: string, periodStart: Date, periodEnd: Date) => Promise<number>;
}

/** A collected metric value with normalization */
export interface MetricValue {
  name: string;
  rawValue: number;
  normalizedValue: number; // 0–100
  weight: number;
}

// ============================================================
// Metric Definitions
// ============================================================

const metricDefinitions: MetricDefinition[] = [
  // ----------------------------------------------------------
  // Task Completion Rate (30%)
  // ----------------------------------------------------------
  {
    name: 'Task Completion Rate',
    weight: 0.30,
    description: 'Ratio of completed tasks to total assigned tasks',
    unit: '%',
    higherIsBetter: true,
    async calculate(agentId: string, periodStart: Date, _periodEnd: Date): Promise<number> {
      const [assigned] = await db
        .select({ total: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.assignedAgentId, agentId),
            gte(tasks.createdAt, periodStart),
          ),
        );

      const [completed] = await db
        .select({ total: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.assignedAgentId, agentId),
            eq(tasks.status, 'completed'),
            gte(tasks.completedAt, periodStart),
          ),
        );

      const assignedCount = assigned?.total ?? 0;
      const completedCount = completed?.total ?? 0;

      if (assignedCount === 0) return 50; // default when no tasks assigned
      return Math.min(100, Math.round((completedCount / assignedCount) * 100));
    },
  },

  // ----------------------------------------------------------
  // Quality Score (25%)
  // ----------------------------------------------------------
  {
    name: 'Quality Score',
    weight: 0.25,
    description: 'Average review score from performance reviews',
    unit: 'points',
    higherIsBetter: true,
    async calculate(agentId: string, periodStart: Date, _periodEnd: Date): Promise<number> {
      const reviews = await db
        .select({ score: performanceReviews.overallScore })
        .from(performanceReviews)
        .where(
          and(
            eq(performanceReviews.agentId, agentId),
            gte(performanceReviews.reviewedAt, periodStart),
          ),
        );

      if (reviews.length === 0) return 50; // default when no reviews

      const avgScore =
        reviews.reduce((sum, r) => sum + parseFloat(r.score), 0) / reviews.length;

      // Score is 0-5 range → multiply by 20 to normalize to 0-100
      return Math.min(100, Math.round(avgScore * 20));
    },
  },

  // ----------------------------------------------------------
  // Response Time (15%)
  // ----------------------------------------------------------
  {
    name: 'Response Time',
    weight: 0.15,
    description: 'Average time from task assignment to completion',
    unit: 'hours',
    higherIsBetter: false,
    async calculate(agentId: string, periodStart: Date, _periodEnd: Date): Promise<number> {
      const completedTasks = await db
        .select({
          startedAt: tasks.startedAt,
          completedAt: tasks.completedAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.assignedAgentId, agentId),
            eq(tasks.status, 'completed'),
            gte(tasks.completedAt, periodStart),
          ),
        );

      if (completedTasks.length === 0) return 50; // default

      const durations = completedTasks
        .filter((t) => t.startedAt && t.completedAt)
        .map((t) => {
          const start = new Date(t.startedAt!).getTime();
          const end = new Date(t.completedAt!).getTime();
          return (end - start) / (1000 * 60 * 60); // hours
        });

      if (durations.length === 0) return 50;

      const avgHours = durations.reduce((a, b) => a + b, 0) / durations.length;

      // Normalize: faster is better
      if (avgHours < 1) return 100;
      if (avgHours < 4) return 80;
      if (avgHours < 12) return 60;
      if (avgHours < 24) return 40;
      return 20;
    },
  },

  // ----------------------------------------------------------
  // Tool Efficiency (15%)
  // ----------------------------------------------------------
  {
    name: 'Tool Efficiency',
    weight: 0.15,
    description: 'Ratio of successful tool calls to total tool calls',
    unit: '%',
    higherIsBetter: true,
    async calculate(agentId: string, periodStart: Date, _periodEnd: Date): Promise<number> {
      const [totalCalls] = await db
        .select({ total: count() })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.actor, agentId),
            eq(activityLog.action, 'tool_call'),
            gte(activityLog.createdAt, periodStart),
          ),
        );

      const [successCalls] = await db
        .select({ total: count() })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.actor, agentId),
            eq(activityLog.action, 'tool_call'),
            sql`(${activityLog.details}->>'success')::boolean = true`,
            gte(activityLog.createdAt, periodStart),
          ),
        );

      const total = totalCalls?.total ?? 0;
      const success = successCalls?.total ?? 0;

      if (total === 0) return 70; // default
      return Math.min(100, Math.round((success / total) * 100));
    },
  },

  // ----------------------------------------------------------
  // Learning Rate (10%)
  // ----------------------------------------------------------
  {
    name: 'Learning Rate',
    weight: 0.10,
    description: 'Number of skills acquired by the agent',
    unit: 'skills',
    higherIsBetter: true,
    async calculate(agentId: string, _periodStart: Date, _periodEnd: Date): Promise<number> {
      const [result] = await db
        .select({ total: count() })
        .from(agentSkills)
        .where(eq(agentSkills.agentId, agentId));

      const skillCount = result?.total ?? 0;

      if (skillCount === 0) return 30;
      if (skillCount === 1) return 60;
      if (skillCount === 2) return 80;
      return 100; // 3+
    },
  },

  // ----------------------------------------------------------
  // Cost Efficiency (5%)
  // ----------------------------------------------------------
  {
    name: 'Cost Efficiency',
    weight: 0.05,
    description: 'Ratio of credit rewards earned to LLM costs incurred',
    unit: 'ratio',
    higherIsBetter: true,
    async calculate(agentId: string, periodStart: Date, _periodEnd: Date): Promise<number> {
      // Total credit rewards from completed tasks
      const rewardRows = await db
        .select({ reward: tasks.creditReward })
        .from(tasks)
        .where(
          and(
            eq(tasks.assignedAgentId, agentId),
            eq(tasks.status, 'completed'),
            gte(tasks.completedAt, periodStart),
          ),
        );

      const totalRewards = rewardRows.reduce(
        (sum, r) => sum + (r.reward ? parseFloat(r.reward) : 0),
        0,
      );

      // Total LLM costs
      const costRows = await db
        .select({ cost: llmUsage.costUsd })
        .from(llmUsage)
        .where(
          and(
            eq(llmUsage.agentId, agentId),
            gte(llmUsage.createdAt, periodStart),
          ),
        );

      const totalCost = costRows.reduce(
        (sum, r) => sum + (r.cost ? parseFloat(r.cost) : 0),
        0,
      );

      if (totalCost === 0) return 50; // default
      if (totalRewards === 0) return 20;

      const ratio = totalRewards / totalCost;

      // Normalize: ratio > 10 → 100, ratio > 5 → 80, > 2 → 60, > 1 → 40, else 20
      if (ratio > 10) return 100;
      if (ratio > 5) return 80;
      if (ratio > 2) return 60;
      if (ratio > 1) return 40;
      return 20;
    },
  },
];

// ============================================================
// MetricCollector
// ============================================================

export class MetricCollector {
  // ----------------------------------------------------------
  // Collect all metrics for an agent
  // ----------------------------------------------------------

  async collectAll(agentId: string, periodStart?: Date, periodEnd?: Date): Promise<MetricValue[]> {
    const end = periodEnd ?? new Date();
    const start = periodStart ?? new Date(end.getTime() - 24 * 60 * 60 * 1000); // default: last 24h

    const results: MetricValue[] = [];

    for (const def of metricDefinitions) {
      const value = await this.collect(agentId, def, start, end);
      results.push(value);
    }

    log.debug(
      { agentId, metricCount: results.length },
      'Collected all metrics',
    );

    return results;
  }

  // ----------------------------------------------------------
  // Collect a single metric
  // ----------------------------------------------------------

  async collect(
    agentId: string,
    definition: MetricDefinition,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MetricValue> {
    let rawValue: number;

    try {
      rawValue = await definition.calculate(agentId, periodStart, periodEnd);
    } catch (error) {
      log.warn(
        { agentId, metric: definition.name, error },
        'Failed to calculate metric, using default',
      );
      rawValue = 50; // safe default
    }

    // Normalized value is the raw value itself (already 0-100)
    const normalizedValue = Math.max(0, Math.min(100, rawValue));

    return {
      name: definition.name,
      rawValue,
      normalizedValue,
      weight: definition.weight,
    };
  }

  // ----------------------------------------------------------
  // Store collected metrics in kpiMetrics table
  // ----------------------------------------------------------

  async storeMetrics(
    agentId: string,
    metrics: MetricValue[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const rows = metrics.map((m) => ({
      agentId,
      metricName: m.name,
      metricValue: m.normalizedValue.toFixed(4),
      periodStart,
      periodEnd,
    }));

    if (rows.length > 0) {
      await db.insert(kpiMetrics).values(rows);
    }

    log.debug(
      { agentId, storedCount: rows.length },
      'Stored KPI metrics',
    );
  }

  // ----------------------------------------------------------
  // Get metric history for an agent
  // ----------------------------------------------------------

  async getHistory(
    agentId: string,
    metricName?: string,
    limit = 50,
  ): Promise<{ metricName: string; metricValue: string; periodStart: Date | null; periodEnd: Date | null; createdAt: Date | null }[]> {
    const conditions = [eq(kpiMetrics.agentId, agentId)];

    if (metricName) {
      conditions.push(eq(kpiMetrics.metricName, metricName));
    }

    const rows = await db
      .select({
        metricName: kpiMetrics.metricName,
        metricValue: kpiMetrics.metricValue,
        periodStart: kpiMetrics.periodStart,
        periodEnd: kpiMetrics.periodEnd,
        createdAt: kpiMetrics.createdAt,
      })
      .from(kpiMetrics)
      .where(and(...conditions))
      .orderBy(desc(kpiMetrics.createdAt))
      .limit(limit);

    return rows;
  }

  // ----------------------------------------------------------
  // Get all metric definitions
  // ----------------------------------------------------------

  getDefinitions(): MetricDefinition[] {
    return [...metricDefinitions];
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const metricCollector = new MetricCollector();
