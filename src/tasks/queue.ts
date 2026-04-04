// ============================================================
// Task Queue — in-memory priority queue for task scheduling
// ============================================================

import { inArray } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tasks } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('tasks:queue');

// ============================================================
// Types
// ============================================================

export interface QueuedTask {
  id: string;
  priority: string;
  complexity: number;
  requiredSkills: string[];
  queuedAt: Date;
  retryCount: number;
}

// ============================================================
// Priority values for sorting (lower = higher priority)
// ============================================================

const PRIORITY_VALUE: Record<string, number> = {
  urgent: 0,
  high:   1,
  normal: 2,
  low:    3,
};

// ============================================================
// TaskQueue
// ============================================================

export class TaskQueue {
  private queue: QueuedTask[] = [];

  // ----------------------------------------------------------
  // Add a task to the queue
  // ----------------------------------------------------------

  enqueue(task: QueuedTask): void {
    // Prevent duplicates
    if (this.has(task.id)) {
      log.debug({ taskId: task.id }, 'Task already in queue — skipping');
      return;
    }

    this.queue.push(task);
    this.queue.sort((a, b) => this.compareTasks(a, b));

    log.debug(
      { taskId: task.id, priority: task.priority, queueSize: this.queue.length },
      'Task enqueued',
    );
  }

  // ----------------------------------------------------------
  // Remove and return the highest priority task
  // ----------------------------------------------------------

  dequeue(): QueuedTask | undefined {
    if (this.queue.length === 0) {
      return undefined;
    }

    const task = this.queue.shift()!;

    log.debug(
      { taskId: task.id, priority: task.priority, queueSize: this.queue.length },
      'Task dequeued',
    );

    return task;
  }

  // ----------------------------------------------------------
  // Peek at the highest priority task without removing
  // ----------------------------------------------------------

  peek(): QueuedTask | undefined {
    return this.queue[0];
  }

  // ----------------------------------------------------------
  // Remove a specific task from the queue
  // ----------------------------------------------------------

  remove(taskId: string): boolean {
    const index = this.queue.findIndex((t) => t.id === taskId);
    if (index === -1) {
      return false;
    }

    this.queue.splice(index, 1);

    log.debug({ taskId, queueSize: this.queue.length }, 'Task removed from queue');

    return true;
  }

  // ----------------------------------------------------------
  // Get all queued tasks (sorted by priority)
  // ----------------------------------------------------------

  getAll(): QueuedTask[] {
    return [...this.queue];
  }

  // ----------------------------------------------------------
  // Get queue size
  // ----------------------------------------------------------

  get size(): number {
    return this.queue.length;
  }

  // ----------------------------------------------------------
  // Check if a task is in the queue
  // ----------------------------------------------------------

  has(taskId: string): boolean {
    return this.queue.some((t) => t.id === taskId);
  }

  // ----------------------------------------------------------
  // Load queued tasks from database (for startup recovery)
  // ----------------------------------------------------------

  async loadFromDatabase(): Promise<void> {
    const queuedTasks = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.status, ['queued', 'created']));

    let loaded = 0;

    for (const task of queuedTasks) {
      if (!this.has(task.id)) {
        this.queue.push({
          id: task.id,
          priority: task.priority ?? 'normal',
          complexity: task.complexity ?? 1,
          requiredSkills: (task.requiredSkills as string[]) ?? [],
          queuedAt: task.createdAt ?? new Date(),
          retryCount: 0,
        });
        loaded++;
      }
    }

    // Sort after bulk load
    this.queue.sort((a, b) => this.compareTasks(a, b));

    log.info(
      { loaded, totalQueueSize: this.queue.length },
      'Queue loaded from database',
    );
  }

  // ----------------------------------------------------------
  // Clear the queue
  // ----------------------------------------------------------

  clear(): void {
    const previousSize = this.queue.length;
    this.queue = [];
    log.info({ previousSize }, 'Queue cleared');
  }

  // ----------------------------------------------------------
  // Get tasks that have been queued for longer than a given duration
  // ----------------------------------------------------------

  getStale(maxAgeMs: number): QueuedTask[] {
    const cutoff = Date.now() - maxAgeMs;

    return this.queue.filter(
      (t) => t.queuedAt.getTime() < cutoff,
    );
  }

  // ----------------------------------------------------------
  // Priority ordering:
  //   urgent > high > normal > low (lower value = higher priority)
  //   Then by queuedAt (oldest first)
  // ----------------------------------------------------------

  private compareTasks(a: QueuedTask, b: QueuedTask): number {
    const priorityA = PRIORITY_VALUE[a.priority] ?? 2;
    const priorityB = PRIORITY_VALUE[b.priority] ?? 2;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    // Same priority — oldest first (FIFO)
    return a.queuedAt.getTime() - b.queuedAt.getTime();
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const taskQueue = new TaskQueue();
