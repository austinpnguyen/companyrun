// ============================================================
// Task Manager — full CRUD + lifecycle management for tasks
// ============================================================

import { eq, and, inArray, sql, count } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tasks, activityLog } from '../db/schema.js';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../shared/errors.js';
import type { Task } from '../shared/types.js';
import type { TaskPriority } from '../shared/types.js';

const log = createLogger('tasks');

// ============================================================
// Types
// ============================================================

export interface CreateTaskParams {
  title: string;
  description?: string;
  priority?: TaskPriority;
  complexity?: number;
  requiredSkills?: string[];
  createdBy?: string;
  parentTaskId?: string;
  deadline?: Date;
}

export interface UpdateTaskParams {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  complexity?: number;
  requiredSkills?: string[];
  status?: string;
  deadline?: Date;
}

// ============================================================
// Valid status transitions
// ============================================================

const VALID_TRANSITIONS: Record<string, string[]> = {
  created:     ['queued', 'cancelled'],
  queued:      ['assigned', 'cancelled'],
  assigned:    ['in_progress', 'queued', 'cancelled'],
  in_progress: ['in_review', 'completed', 'failed', 'cancelled'],
  in_review:   ['completed', 'assigned', 'failed'],
  completed:   [],
  failed:      ['queued', 'cancelled'],
  cancelled:   [],
};

// ============================================================
// Priority multipliers for reward calculation
// ============================================================

const PRIORITY_MULTIPLIER: Record<string, number> = {
  urgent: 2.0,
  high:   1.5,
  normal: 1.0,
  low:    0.8,
};

// ============================================================
// TaskManager
// ============================================================

export class TaskManager {
  // ----------------------------------------------------------
  // Create a new task
  // ----------------------------------------------------------

  async create(params: CreateTaskParams): Promise<Task> {
    if (!params.title || params.title.trim().length === 0) {
      throw new ValidationError('Task title is required');
    }

    if (params.complexity !== undefined && (params.complexity < 1 || params.complexity > 5)) {
      throw new ValidationError('Task complexity must be between 1 and 5');
    }

    const complexity = params.complexity ?? 1;
    const priority = params.priority ?? 'normal';
    const creditReward = this.calculateReward(complexity, priority);

    const [task] = await db
      .insert(tasks)
      .values({
        title: params.title.trim(),
        description: params.description ?? null,
        priority,
        complexity,
        status: 'created',
        requiredSkills: params.requiredSkills ?? [],
        createdBy: params.createdBy ?? 'user',
        parentTaskId: params.parentTaskId ?? null,
        deadline: params.deadline ?? null,
        creditReward: creditReward.toFixed(2),
      })
      .returning();

    log.info(
      { taskId: task.id, title: task.title, priority, complexity, creditReward },
      'Task created',
    );

    // Log activity
    await db.insert(activityLog).values({
      actor: params.createdBy ?? 'user',
      action: 'task_created',
      entityType: 'task',
      entityId: task.id,
      details: {
        title: task.title,
        priority,
        complexity,
        creditReward,
        parentTaskId: params.parentTaskId ?? null,
      },
    });

    return task;
  }

  // ----------------------------------------------------------
  // Get a task by ID
  // ----------------------------------------------------------

  async getById(taskId: string): Promise<Task | null> {
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);

    return task ?? null;
  }

  // ----------------------------------------------------------
  // List tasks with optional filters
  // ----------------------------------------------------------

  async list(filters?: {
    status?: string | string[];
    priority?: string;
    assignedAgentId?: string;
    createdBy?: string;
    parentTaskId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<{ tasks: Task[]; total: number }> {
    const conditions = [];

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(inArray(tasks.status, filters.status));
      } else {
        conditions.push(eq(tasks.status, filters.status));
      }
    }

    if (filters?.priority) {
      conditions.push(eq(tasks.priority, filters.priority));
    }

    if (filters?.assignedAgentId) {
      conditions.push(eq(tasks.assignedAgentId, filters.assignedAgentId));
    }

    if (filters?.createdBy) {
      conditions.push(eq(tasks.createdBy, filters.createdBy));
    }

    if (filters?.parentTaskId !== undefined) {
      if (filters.parentTaskId === null) {
        conditions.push(sql`${tasks.parentTaskId} IS NULL`);
      } else {
        conditions.push(eq(tasks.parentTaskId, filters.parentTaskId));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalResult] = await db
      .select({ count: count() })
      .from(tasks)
      .where(whereClause);

    const total = totalResult?.count ?? 0;

    const rows = await db
      .select()
      .from(tasks)
      .where(whereClause)
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)
      .orderBy(tasks.createdAt);

    return { tasks: rows, total };
  }

  // ----------------------------------------------------------
  // Update a task
  // ----------------------------------------------------------

  async update(taskId: string, params: UpdateTaskParams): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    if (params.complexity !== undefined && (params.complexity < 1 || params.complexity > 5)) {
      throw new ValidationError('Task complexity must be between 1 and 5');
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (params.title !== undefined) updateData.title = params.title.trim();
    if (params.description !== undefined) updateData.description = params.description;
    if (params.priority !== undefined) updateData.priority = params.priority;
    if (params.complexity !== undefined) updateData.complexity = params.complexity;
    if (params.requiredSkills !== undefined) updateData.requiredSkills = params.requiredSkills;
    if (params.status !== undefined) updateData.status = params.status;
    if (params.deadline !== undefined) updateData.deadline = params.deadline;

    // Recalculate reward if complexity or priority changed
    if (params.complexity !== undefined || params.priority !== undefined) {
      const newComplexity = params.complexity ?? existing.complexity ?? 1;
      const newPriority = params.priority ?? existing.priority ?? 'normal';
      updateData.creditReward = this.calculateReward(newComplexity, newPriority).toFixed(2);
    }

    const [updated] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    log.info({ taskId, changes: Object.keys(params) }, 'Task updated');

    return updated;
  }

  // ----------------------------------------------------------
  // Delete a task (and subtasks)
  // ----------------------------------------------------------

  async delete(taskId: string): Promise<void> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    // Delete subtasks first
    const subtasks = await this.getSubtasks(taskId);
    for (const subtask of subtasks) {
      await db.delete(tasks).where(eq(tasks.id, subtask.id));
    }

    // Delete the parent task
    await db.delete(tasks).where(eq(tasks.id, taskId));

    log.info(
      { taskId, subtasksDeleted: subtasks.length },
      'Task deleted',
    );

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'task_deleted',
      entityType: 'task',
      entityId: taskId,
      details: { title: existing.title, subtasksDeleted: subtasks.length },
    });
  }

  // ----------------------------------------------------------
  // Assign a task to an agent
  // ----------------------------------------------------------

  async assign(taskId: string, agentId: string): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    const currentStatus = existing.status ?? 'created';
    if (!['created', 'queued', 'failed'].includes(currentStatus)) {
      throw new ConflictError(
        `Cannot assign task in '${currentStatus}' status. Task must be created, queued, or failed.`,
      );
    }

    const [updated] = await db
      .update(tasks)
      .set({
        assignedAgentId: agentId,
        status: 'assigned',
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    log.info({ taskId, agentId }, 'Task assigned to agent');

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'task_assigned',
      entityType: 'task',
      entityId: taskId,
      details: { agentId, title: existing.title },
    });

    return updated;
  }

  // ----------------------------------------------------------
  // Unassign a task (put back in queue)
  // ----------------------------------------------------------

  async unassign(taskId: string): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    if (!existing.assignedAgentId) {
      throw new ConflictError('Task is not assigned to any agent');
    }

    const previousAgent = existing.assignedAgentId;

    const [updated] = await db
      .update(tasks)
      .set({
        assignedAgentId: null,
        status: 'queued',
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    log.info({ taskId, previousAgent }, 'Task unassigned and returned to queue');

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'task_unassigned',
      entityType: 'task',
      entityId: taskId,
      details: { previousAgent, title: existing.title },
    });

    return updated;
  }

  // ----------------------------------------------------------
  // Transition task status
  // ----------------------------------------------------------

  async transition(taskId: string, newStatus: string): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    const currentStatus = existing.status ?? 'created';
    const allowedNext = VALID_TRANSITIONS[currentStatus];

    if (!allowedNext || !allowedNext.includes(newStatus)) {
      throw new ConflictError(
        `Invalid status transition: '${currentStatus}' → '${newStatus}'. ` +
        `Allowed transitions from '${currentStatus}': ${allowedNext?.join(', ') ?? 'none'}`,
      );
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    // Set timestamps based on status change
    if (newStatus === 'in_progress' && !existing.startedAt) {
      updateData.startedAt = new Date();
    }
    if (newStatus === 'completed' || newStatus === 'failed') {
      updateData.completedAt = new Date();
    }

    const [updated] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    log.info(
      { taskId, from: currentStatus, to: newStatus },
      'Task status transitioned',
    );

    await db.insert(activityLog).values({
      actor: 'system',
      action: 'task_status_changed',
      entityType: 'task',
      entityId: taskId,
      details: { from: currentStatus, to: newStatus, title: existing.title },
    });

    return updated;
  }

  // ----------------------------------------------------------
  // Mark task as started
  // ----------------------------------------------------------

  async start(taskId: string): Promise<Task> {
    return this.transition(taskId, 'in_progress');
  }

  // ----------------------------------------------------------
  // Mark task as completed with result
  // ----------------------------------------------------------

  async complete(taskId: string, result: Record<string, unknown>): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    const currentStatus = existing.status ?? 'created';
    const allowedNext = VALID_TRANSITIONS[currentStatus];

    if (!allowedNext || !allowedNext.includes('completed')) {
      throw new ConflictError(
        `Cannot complete task in '${currentStatus}' status. ` +
        `Allowed transitions: ${allowedNext?.join(', ') ?? 'none'}`,
      );
    }

    const [updated] = await db
      .update(tasks)
      .set({
        status: 'completed',
        result,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    log.info({ taskId, title: existing.title }, 'Task completed');

    await db.insert(activityLog).values({
      actor: existing.assignedAgentId ?? 'system',
      action: 'task_completed',
      entityType: 'task',
      entityId: taskId,
      details: { title: existing.title, hasResult: true },
    });

    return updated;
  }

  // ----------------------------------------------------------
  // Mark task as failed
  // ----------------------------------------------------------

  async fail(taskId: string, reason: string): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    const currentStatus = existing.status ?? 'created';
    const allowedNext = VALID_TRANSITIONS[currentStatus];

    if (!allowedNext || !allowedNext.includes('failed')) {
      throw new ConflictError(
        `Cannot fail task in '${currentStatus}' status. ` +
        `Allowed transitions: ${allowedNext?.join(', ') ?? 'none'}`,
      );
    }

    const existingResult = (existing.result as Record<string, unknown>) ?? {};

    const [updated] = await db
      .update(tasks)
      .set({
        status: 'failed',
        result: { ...existingResult, failureReason: reason },
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning();

    log.warn({ taskId, reason, title: existing.title }, 'Task failed');

    await db.insert(activityLog).values({
      actor: existing.assignedAgentId ?? 'system',
      action: 'task_failed',
      entityType: 'task',
      entityId: taskId,
      details: { title: existing.title, reason },
    });

    return updated;
  }

  // ----------------------------------------------------------
  // Cancel a task (terminal-state guard)
  // ----------------------------------------------------------

  async cancel(taskId: string): Promise<Task> {
    const existing = await this.getById(taskId);
    if (!existing) {
      throw new NotFoundError('Task', taskId);
    }

    const terminalStatuses = ['completed', 'failed', 'cancelled'];
    if (terminalStatuses.includes(existing.status ?? '')) {
      throw new ConflictError(
        `Cannot cancel task in '${existing.status}' status — already in a terminal state`,
      );
    }

    return this.transition(taskId, 'cancelled');
  }

  // ----------------------------------------------------------
  // Get subtasks for a parent task
  // ----------------------------------------------------------

  async getSubtasks(parentTaskId: string): Promise<Task[]> {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId))
      .orderBy(tasks.createdAt);
  }

  // ----------------------------------------------------------
  // Get task stats (counts by status)
  // ----------------------------------------------------------

  async getStats(): Promise<Record<string, number>> {
    const rows = await db
      .select({
        status: tasks.status,
        count: count(),
      })
      .from(tasks)
      .groupBy(tasks.status);

    const stats: Record<string, number> = {};
    for (const row of rows) {
      stats[row.status ?? 'unknown'] = row.count;
    }
    return stats;
  }

  // ----------------------------------------------------------
  // Calculate credit reward based on complexity and priority
  // ----------------------------------------------------------

  calculateReward(complexity: number, priority: string): number {
    const base = complexity * env.DEFAULT_TASK_REWARD;
    const multiplier = PRIORITY_MULTIPLIER[priority] ?? 1.0;
    return base * multiplier;
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const taskManager = new TaskManager();
