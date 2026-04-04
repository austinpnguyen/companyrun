// ============================================================
// KPI Calculator — computes weighted scores, grades, and trends
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { agents, performanceReviews } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { metricCollector } from './metrics.js';
import type { MetricValue } from './metrics.js';

const log = createLogger('kpi:calculator');

// ============================================================
// Types
// ============================================================

export interface KPIScore {
  overallScore: number;
  metrics: MetricValue[];
  grade: string;
  trend: 'improving' | 'stable' | 'declining';
}

// ============================================================
// Grade boundaries
// ============================================================

const GRADE_BOUNDARIES: { min: number; grade: string }[] = [
  { min: 90, grade: 'A' },
  { min: 75, grade: 'B' },
  { min: 60, grade: 'C' },
  { min: 40, grade: 'D' },
  { min: 0,  grade: 'F' },
];

// ============================================================
// KPICalculator
// ============================================================

export class KPICalculator {
  // ----------------------------------------------------------
  // Calculate full KPI score for an agent
  // ----------------------------------------------------------

  async calculate(agentId: string, periodStart?: Date, periodEnd?: Date): Promise<KPIScore> {
    const end = periodEnd ?? new Date();
    const start = periodStart ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);

    // Collect all metrics
    const metrics = await metricCollector.collectAll(agentId, start, end);

    // Compute weighted score
    const overallScore = this.computeWeightedScore(metrics);

    // Determine grade
    const grade = this.getGrade(overallScore);

    // Calculate trend from historical reviews
    const trend = await this.calculateTrend(agentId, overallScore);

    const score: KPIScore = { overallScore, metrics, grade, trend };

    log.info(
      { agentId, overallScore, grade, trend },
      'KPI score calculated',
    );

    return score;
  }

  // ----------------------------------------------------------
  // Compute weighted average of all metric values
  // ----------------------------------------------------------

  computeWeightedScore(metrics: MetricValue[]): number {
    if (metrics.length === 0) return 0;

    const totalWeight = metrics.reduce((sum, m) => sum + m.weight, 0);

    if (totalWeight === 0) return 0;

    const weightedSum = metrics.reduce(
      (sum, m) => sum + m.normalizedValue * m.weight,
      0,
    );

    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }

  // ----------------------------------------------------------
  // Map score to letter grade
  // ----------------------------------------------------------

  getGrade(score: number): string {
    for (const boundary of GRADE_BOUNDARIES) {
      if (score >= boundary.min) {
        return boundary.grade;
      }
    }
    return 'F';
  }

  // ----------------------------------------------------------
  // Calculate trend by comparing to average of last 3 reviews
  // ----------------------------------------------------------

  async calculateTrend(
    agentId: string,
    currentScore: number,
  ): Promise<'improving' | 'stable' | 'declining'> {
    const recentReviews = await db
      .select({ overallScore: performanceReviews.overallScore })
      .from(performanceReviews)
      .where(eq(performanceReviews.agentId, agentId))
      .orderBy(desc(performanceReviews.reviewedAt))
      .limit(3);

    if (recentReviews.length === 0) {
      return 'stable'; // no history to compare
    }

    const avgPrevious =
      recentReviews.reduce((sum, r) => sum + parseFloat(r.overallScore), 0) /
      recentReviews.length;

    const delta = currentScore - avgPrevious;

    if (delta >= 5) return 'improving';
    if (delta <= -5) return 'declining';
    return 'stable';
  }

  // ----------------------------------------------------------
  // Calculate KPI scores for all active agents
  // ----------------------------------------------------------

  async calculateAll(periodStart?: Date, periodEnd?: Date): Promise<Map<string, KPIScore>> {
    const activeAgents = await db
      .select({ id: agents.id })
      .from(agents)
      .where(eq(agents.status, 'active'));

    const results = new Map<string, KPIScore>();

    for (const agent of activeAgents) {
      try {
        const score = await this.calculate(agent.id, periodStart, periodEnd);
        results.set(agent.id, score);
      } catch (error) {
        log.error(
          { agentId: agent.id, error },
          'Failed to calculate KPI for agent',
        );
      }
    }

    log.info(
      { agentCount: results.size },
      'Calculated KPI scores for all active agents',
    );

    return results;
  }

  // ----------------------------------------------------------
  // Get score history for an agent
  // ----------------------------------------------------------

  async getScoreHistory(
    agentId: string,
    limit = 20,
  ): Promise<{ overallScore: number; grade: string; reviewedAt: Date | null }[]> {
    const reviews = await db
      .select({
        overallScore: performanceReviews.overallScore,
        reviewedAt: performanceReviews.reviewedAt,
      })
      .from(performanceReviews)
      .where(eq(performanceReviews.agentId, agentId))
      .orderBy(desc(performanceReviews.reviewedAt))
      .limit(limit);

    return reviews.map((r) => ({
      overallScore: parseFloat(r.overallScore),
      grade: this.getGrade(parseFloat(r.overallScore)),
      reviewedAt: r.reviewedAt,
    }));
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const kpiCalculator = new KPICalculator();
