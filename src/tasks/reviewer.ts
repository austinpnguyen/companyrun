// ============================================================
// Task Reviewer — quality review for completed task results
// ============================================================

import { eq } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tasks, activityLog } from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../shared/errors.js';
import { safeJsonParse } from '../shared/utils.js';
import { llmGateway } from '../llm/index.js';
import { taskManager } from './manager.js';
import type { Task } from '../shared/types.js';

const log = createLogger('tasks:reviewer');

// ============================================================
// Types
// ============================================================

export interface ReviewResult {
  taskId: string;
  score: number;
  feedback: string;
  approved: boolean;
  reviewedBy: string;
}

// ============================================================
// System prompt for auto-review
// ============================================================

const REVIEW_SYSTEM_PROMPT = `You are a quality reviewer for task results. Evaluate the completed work against the original task description.

Scoring criteria (1–5):
  1 — Completely fails to address the task
  2 — Partially addresses the task but with major issues
  3 — Addresses the task adequately with some issues
  4 — Good quality work that meets expectations
  5 — Excellent work that exceeds expectations

Respond ONLY with a valid JSON object containing:
{
  "score": <number 1-5>,
  "feedback": "<detailed feedback string>",
  "approved": <boolean - true if score >= 3>
}

No extra text, no markdown fences.`;

// ============================================================
// TaskReviewer
// ============================================================

export class TaskReviewer {
  // ----------------------------------------------------------
  // Auto-review a completed task using LLM
  // ----------------------------------------------------------

  async autoReview(taskId: string): Promise<ReviewResult> {
    const task = await taskManager.getById(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    if (task.status !== 'completed' && task.status !== 'in_review') {
      throw new ConflictError(
        `Cannot review task in '${task.status}' status. Task must be completed or in_review.`,
      );
    }

    log.info({ taskId, title: task.title }, 'Auto-reviewing task');

    const taskResult = task.result as Record<string, unknown> | null;
    const resultSummary = taskResult
      ? JSON.stringify(taskResult, null, 2).slice(0, 3000)
      : 'No result data available.';

    const userPrompt = [
      `Task Title: ${task.title}`,
      `Task Description: ${task.description ?? 'No description provided.'}`,
      `Priority: ${task.priority ?? 'normal'}`,
      `Complexity: ${task.complexity ?? 1}`,
      '',
      'Task Result:',
      resultSummary,
      '',
      'Please evaluate this task result and provide a score, feedback, and approval decision.',
    ].join('\n');

    const response = await llmGateway.chatWithFallback({
      model: env.ORCHESTRATOR_MODEL,
      messages: [
        { role: 'system', content: REVIEW_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1000,
    });

    const rawContent = response.choices[0]?.message?.content ?? '{}';

    // Strip markdown code fences if present
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    const parsed = safeJsonParse<{
      score?: number;
      feedback?: string;
      approved?: boolean;
    }>(cleaned, {});

    const score = Math.min(Math.max(parsed.score ?? 3, 1), 5);
    const feedback = parsed.feedback ?? 'Review completed.';
    const approved = parsed.approved ?? score >= 3;

    const review: ReviewResult = {
      taskId,
      score,
      feedback,
      approved,
      reviewedBy: 'orchestrator',
    };

    // Store review in the task's result JSONB field
    await this.storeReview(task, review);

    log.info(
      { taskId, score, approved, reviewedBy: 'orchestrator' },
      'Auto-review completed',
    );

    // Handle low scores
    if (score < 3) {
      await this.handleLowScore(taskId, review);
    }

    return review;
  }

  // ----------------------------------------------------------
  // Submit a manual review (user reviews)
  // ----------------------------------------------------------

  async manualReview(
    taskId: string,
    score: number,
    feedback: string,
  ): Promise<ReviewResult> {
    if (score < 1 || score > 5) {
      throw new ValidationError('Review score must be between 1 and 5');
    }

    if (!feedback || feedback.trim().length === 0) {
      throw new ValidationError('Review feedback is required');
    }

    const task = await taskManager.getById(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    if (task.status !== 'completed' && task.status !== 'in_review') {
      throw new ConflictError(
        `Cannot review task in '${task.status}' status. Task must be completed or in_review.`,
      );
    }

    const approved = score >= 3;

    const review: ReviewResult = {
      taskId,
      score,
      feedback: feedback.trim(),
      approved,
      reviewedBy: 'user',
    };

    // Store review in the task's result JSONB field
    await this.storeReview(task, review);

    log.info(
      { taskId, score, approved, reviewedBy: 'user' },
      'Manual review submitted',
    );

    // Handle low scores
    if (score < 3) {
      await this.handleLowScore(taskId, review);
    }

    return review;
  }

  // ----------------------------------------------------------
  // Get review for a task
  // ----------------------------------------------------------

  async getReview(taskId: string): Promise<ReviewResult | null> {
    const task = await taskManager.getById(taskId);
    if (!task) {
      return null;
    }

    const result = task.result as Record<string, unknown> | null;
    if (!result || !result.review) {
      return null;
    }

    const review = result.review as {
      score?: number;
      feedback?: string;
      approved?: boolean;
      reviewedBy?: string;
    };

    return {
      taskId,
      score: review.score ?? 0,
      feedback: review.feedback ?? '',
      approved: review.approved ?? false,
      reviewedBy: review.reviewedBy ?? 'unknown',
    };
  }

  // ----------------------------------------------------------
  // Handle low score — send task back for rework
  // ----------------------------------------------------------

  async handleLowScore(taskId: string, review: ReviewResult): Promise<void> {
    const task = await taskManager.getById(taskId);
    if (!task) {
      throw new NotFoundError('Task', taskId);
    }

    log.warn(
      { taskId, score: review.score, title: task.title },
      'Low review score — sending task back for rework',
    );

    // Append review feedback to description for context
    const originalDescription = task.description ?? '';
    const reworkNote = `\n\n--- REWORK REQUESTED (Score: ${review.score}/5) ---\nFeedback: ${review.feedback}`;
    const updatedDescription = originalDescription + reworkNote;

    // Update task: append feedback and reset to assigned status
    await db
      .update(tasks)
      .set({
        description: updatedDescription,
        status: 'assigned',
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    // Log the rework activity
    await db.insert(activityLog).values({
      actor: review.reviewedBy,
      action: 'task_sent_for_rework',
      entityType: 'task',
      entityId: taskId,
      details: {
        title: task.title,
        score: review.score,
        feedback: review.feedback,
        assignedAgentId: task.assignedAgentId,
      },
    });
  }

  // ----------------------------------------------------------
  // Internal: store review in the task's result JSONB
  // ----------------------------------------------------------

  private async storeReview(task: Task, review: ReviewResult): Promise<void> {
    const existingResult = (task.result as Record<string, unknown>) ?? {};

    const updatedResult = {
      ...existingResult,
      review: {
        score: review.score,
        feedback: review.feedback,
        approved: review.approved,
        reviewedBy: review.reviewedBy,
        reviewedAt: new Date().toISOString(),
      },
    };

    await db
      .update(tasks)
      .set({
        result: updatedResult,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));

    // Log the review activity
    await db.insert(activityLog).values({
      actor: review.reviewedBy,
      action: 'task_reviewed',
      entityType: 'task',
      entityId: task.id,
      details: {
        score: review.score,
        approved: review.approved,
        reviewedBy: review.reviewedBy,
      },
    });
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const taskReviewer = new TaskReviewer();
