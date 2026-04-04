// ============================================================
// Performance Reviewer — conducts and stores agent reviews
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { agents, performanceReviews } from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import { wageService } from '../economy/wages.js';
import { kpiCalculator } from './calculator.js';
import { metricCollector } from './metrics.js';
import type { MetricValue } from './metrics.js';
import type { ReviewRecommendation } from '../shared/types.js';

const log = createLogger('kpi:reviewer');

// ============================================================
// Types
// ============================================================

export interface PerformanceReview {
  agentId: string;
  agentName: string;
  overallScore: number;
  grade: string;
  trend: 'improving' | 'stable' | 'declining';
  metrics: MetricValue[];
  recommendation: ReviewRecommendation;
  notes: string;
  reviewedAt: Date;
}

// ============================================================
// PerformanceReviewer
// ============================================================

export class PerformanceReviewer {
  // ----------------------------------------------------------
  // Review a single agent
  // ----------------------------------------------------------

  async reviewAgent(agentId: string, periodStart?: Date, periodEnd?: Date): Promise<PerformanceReview> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const end = periodEnd ?? new Date();
    const start = periodStart ?? new Date(end.getTime() - 24 * 60 * 60 * 1000);

    // Calculate KPI score
    const kpiScore = await kpiCalculator.calculate(agentId, start, end);

    // Store raw metrics
    await metricCollector.storeMetrics(agentId, kpiScore.metrics, start, end);

    // Determine recommendation based on history
    const recommendation = await this.determineRecommendation(
      agentId,
      kpiScore.overallScore,
    );

    // Build notes
    const notes = this.buildNotes(kpiScore.overallScore, kpiScore.grade, kpiScore.trend, recommendation);

    const review: PerformanceReview = {
      agentId,
      agentName: agent.name,
      overallScore: kpiScore.overallScore,
      grade: kpiScore.grade,
      trend: kpiScore.trend,
      metrics: kpiScore.metrics,
      recommendation,
      notes,
      reviewedAt: end,
    };

    // Persist review
    await this.storeReview(review);

    // Apply KPI bonus if score > 80
    if (kpiScore.overallScore > 80) {
      try {
        await wageService.applyKPIBonus(agentId, kpiScore.overallScore);
        log.info(
          { agentId, score: kpiScore.overallScore },
          'KPI bonus applied after review',
        );
      } catch (error) {
        log.warn(
          { agentId, error },
          'Failed to apply KPI bonus',
        );
      }
    }

    log.info(
      { agentId, agentName: agent.name, score: kpiScore.overallScore, grade: kpiScore.grade, recommendation },
      'Performance review completed',
    );

    return review;
  }

  // ----------------------------------------------------------
  // Review all active agents
  // ----------------------------------------------------------

  async reviewAll(periodStart?: Date, periodEnd?: Date): Promise<PerformanceReview[]> {
    const activeAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.status, 'active'));

    const reviews: PerformanceReview[] = [];

    for (const agent of activeAgents) {
      try {
        const review = await this.reviewAgent(agent.id, periodStart, periodEnd);
        reviews.push(review);
      } catch (error) {
        log.error(
          { agentId: agent.id, error },
          'Failed to review agent',
        );
      }
    }

    log.info(
      { reviewedCount: reviews.length, totalAgents: activeAgents.length },
      'Completed performance reviews for all agents',
    );

    return reviews;
  }

  // ----------------------------------------------------------
  // Determine recommendation based on score history
  // ----------------------------------------------------------

  async determineRecommendation(
    agentId: string,
    currentScore: number,
  ): Promise<ReviewRecommendation> {
    const warningThreshold = env.KPI_WARNING_THRESHOLD;
    const fireThreshold = env.KPI_FIRE_THRESHOLD;
    const consecutiveRequired = env.KPI_FIRE_CONSECUTIVE_REVIEWS;

    // Get recent review history (most recent first)
    const recentReviews = await db
      .select({ overallScore: performanceReviews.overallScore })
      .from(performanceReviews)
      .where(eq(performanceReviews.agentId, agentId))
      .orderBy(desc(performanceReviews.reviewedAt))
      .limit(consecutiveRequired);

    const allScores = [currentScore, ...recentReviews.map((r) => parseFloat(r.overallScore))];

    // Fire: score < fireThreshold for N consecutive reviews
    if (allScores.length >= consecutiveRequired) {
      const lastN = allScores.slice(0, consecutiveRequired);
      const allBelowFire = lastN.every((s) => s < fireThreshold);
      if (allBelowFire) {
        return 'fire';
      }
    }

    // Review: score < warningThreshold for 2+ consecutive
    if (allScores.length >= 2) {
      const lastTwo = allScores.slice(0, 2);
      const allBelowWarning = lastTwo.every((s) => s < warningThreshold);
      if (allBelowWarning) {
        return 'review';
      }
    }

    // Warn: current score below warning threshold
    if (currentScore < warningThreshold) {
      return 'warn';
    }

    // Promote: score > 85 for 3+ consecutive reviews
    if (allScores.length >= 3) {
      const lastThree = allScores.slice(0, 3);
      const allAbovePromote = lastThree.every((s) => s > 85);
      if (allAbovePromote) {
        return 'promote';
      }
    }

    // Maintain: score between 60-85
    return 'maintain';
  }

  // ----------------------------------------------------------
  // Store review in performanceReviews table
  // ----------------------------------------------------------

  async storeReview(review: PerformanceReview): Promise<void> {
    await db.insert(performanceReviews).values({
      agentId: review.agentId,
      overallScore: review.overallScore.toFixed(2),
      metrics: review.metrics as unknown as Record<string, unknown>,
      recommendation: review.recommendation,
      notes: review.notes,
      reviewedAt: review.reviewedAt,
    });

    log.debug(
      { agentId: review.agentId, score: review.overallScore },
      'Performance review stored',
    );
  }

  // ----------------------------------------------------------
  // Get review history for an agent
  // ----------------------------------------------------------

  async getReviewHistory(agentId: string, limit = 20): Promise<PerformanceReview[]> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (!agent) {
      throw new NotFoundError('Agent', agentId);
    }

    const rows = await db
      .select()
      .from(performanceReviews)
      .where(eq(performanceReviews.agentId, agentId))
      .orderBy(desc(performanceReviews.reviewedAt))
      .limit(limit);

    return rows.map((r) => ({
      agentId: r.agentId,
      agentName: agent.name,
      overallScore: parseFloat(r.overallScore),
      grade: kpiCalculator.getGrade(parseFloat(r.overallScore)),
      trend: 'stable' as const, // historical reviews don't recalculate trend
      metrics: (r.metrics ?? []) as unknown as MetricValue[],
      recommendation: (r.recommendation ?? 'maintain') as ReviewRecommendation,
      notes: r.notes ?? '',
      reviewedAt: r.reviewedAt ?? new Date(),
    }));
  }

  // ----------------------------------------------------------
  // Get the latest review for an agent
  // ----------------------------------------------------------

  async getLatestReview(agentId: string): Promise<PerformanceReview | null> {
    const reviews = await this.getReviewHistory(agentId, 1);
    return reviews.length > 0 ? reviews[0]! : null;
  }

  // ----------------------------------------------------------
  // Check if a review is due for an agent
  // ----------------------------------------------------------

  async isReviewDue(agentId: string): Promise<boolean> {
    const intervalHours = env.KPI_REVIEW_INTERVAL_HOURS;

    const [latest] = await db
      .select({ reviewedAt: performanceReviews.reviewedAt })
      .from(performanceReviews)
      .where(eq(performanceReviews.agentId, agentId))
      .orderBy(desc(performanceReviews.reviewedAt))
      .limit(1);

    if (!latest) {
      return true; // never reviewed
    }

    const reviewedAt = latest.reviewedAt ?? new Date(0);
    const msSinceReview = Date.now() - new Date(reviewedAt).getTime();
    const hoursSinceReview = msSinceReview / (1000 * 60 * 60);

    return hoursSinceReview >= intervalHours;
  }

  // ----------------------------------------------------------
  // Internal: build human-readable notes
  // ----------------------------------------------------------

  private buildNotes(
    score: number,
    grade: string,
    trend: string,
    recommendation: ReviewRecommendation,
  ): string {
    const parts: string[] = [
      `Overall score: ${score.toFixed(2)} (Grade ${grade})`,
      `Trend: ${trend}`,
      `Recommendation: ${recommendation}`,
    ];

    if (recommendation === 'fire') {
      parts.push('⚠️ Agent has consistently underperformed. Recommending termination.');
    } else if (recommendation === 'review') {
      parts.push('Agent is under performance review due to consecutive low scores.');
    } else if (recommendation === 'warn') {
      parts.push('Agent score is below warning threshold. Improvement needed.');
    } else if (recommendation === 'promote') {
      parts.push('🌟 Agent has consistently excelled. Eligible for promotion.');
    }

    return parts.join(' | ');
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const performanceReviewer = new PerformanceReviewer();
