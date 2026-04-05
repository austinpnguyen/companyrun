// ============================================================
// CronManager — fires recurring tasks on a cron schedule
// ============================================================
//
// Tasks with a cronExpression (e.g. "*/30 * * * *") are called
// "cron templates". Each tick, due templates spawn a new task
// instance (status = 'assigned') and advance cronNextRun.
//
// Supported cron syntax (subset):
//   */N * * * *   — every N minutes
//   0 */N * * *   — every N hours (at :00)
//   0 H * * *     — every day at hour H (UTC)
//   * * * * *     — every minute (testing only)
// ============================================================

import { eq, and, lte, sql } from 'drizzle-orm';
import { db } from '../config/database.js';
import { tasks } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';

const log = createLogger('tasks:cron');

// ── Cron expression parser ────────────────────────────────────

/**
 * Given a cron expression and a base date, return the next
 * Date the expression should fire (always ≥ base + 1 second).
 *
 * Supports the subset: "MIN HOUR DOM MON DOW"
 * where MIN and HOUR may use "*" or star-slash-N or a literal number.
 */
export function nextCronRun(expr: string, from: Date = new Date()): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Fallback: every hour
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }

  const [minPart, hourPart] = parts;

  const next = new Date(from);
  next.setSeconds(0, 0);

  // Every N minutes: "*/N * * * *"
  if (minPart.startsWith('*/')) {
    const n = parseInt(minPart.slice(2), 10) || 1;
    next.setMinutes(next.getMinutes() + n);
    return next;
  }

  // Every minute: "* * * * *"
  if (minPart === '*') {
    next.setMinutes(next.getMinutes() + 1);
    return next;
  }

  // Every N hours at :00 or :MM: "0 */N * * *" or "MM */N * * *" (UTC)
  if (hourPart.startsWith('*/')) {
    const n = parseInt(hourPart.slice(2), 10) || 1;
    const m = parseInt(minPart, 10) || 0;
    next.setUTCMinutes(m, 0, 0);
    next.setUTCHours(next.getUTCHours() + n);
    return next;
  }

  // Daily at specific hour: "0 H * * *" (UTC)
  if (hourPart !== '*') {
    const h = parseInt(hourPart, 10);
    const m = parseInt(minPart, 10) || 0;
    next.setUTCHours(h, m, 0, 0);
    if (next <= from) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // Hourly at specific minute: "M * * * *" (UTC)
  {
    const m = parseInt(minPart, 10) || 0;
    next.setUTCMinutes(m, 0, 0);
    if (next <= from) {
      next.setUTCHours(next.getUTCHours() + 1);
    }
    return next;
  }
}

// ============================================================
// CronManager
// ============================================================

export class CronManager {
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  // ----------------------------------------------------------
  // Start ticking (every 60 seconds)
  // ----------------------------------------------------------

  start(): void {
    if (this.running) return;
    this.running = true;

    // Fire immediately on start, then every 60s
    this.tick().catch((e) => log.error({ e }, 'Cron tick error'));
    this.tickInterval = setInterval(() => {
      this.tick().catch((e) => log.error({ e }, 'Cron tick error'));
    }, 60_000);

    log.info('CronManager started (60s tick)');
  }

  // ----------------------------------------------------------
  // Stop ticking
  // ----------------------------------------------------------

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.running = false;
    log.info('CronManager stopped');
  }

  // ----------------------------------------------------------
  // Tick — find due cron tasks and spawn instances
  // ----------------------------------------------------------

  async tick(): Promise<{ spawned: number }> {
    const now = new Date();

    // Find all cron templates that are due
    const due = await db
      .select()
      .from(tasks)
      .where(
        and(
          sql`${tasks.cronExpression} IS NOT NULL`,
          lte(tasks.cronNextRun, now),
        ),
      );

    if (due.length === 0) return { spawned: 0 };

    log.info({ count: due.length }, 'Cron tick: spawning task instances');

    let spawned = 0;
    for (const template of due) {
      try {
        // Spawn a new task instance with status 'assigned'
        await db.insert(tasks).values({
          title: template.title,
          description: template.description,
          priority: template.priority,
          complexity: template.complexity,
          requiredSkills: template.requiredSkills as string[],
          assignedAgentId: template.assignedAgentId,
          createdBy: 'cron',
          status: template.assignedAgentId ? 'assigned' : 'created',
          parentTaskId: template.id,
          maxRetries: template.maxRetries ?? 2,
        });

        // Advance cronNextRun on the template
        const nextRun = nextCronRun(template.cronExpression!, now);
        await db
          .update(tasks)
          .set({ cronNextRun: nextRun })
          .where(eq(tasks.id, template.id));

        spawned++;
        log.info(
          { templateId: template.id, title: template.title, nextRun },
          'Cron task instance spawned',
        );
      } catch (error) {
        log.error({ error, templateId: template.id }, 'Failed to spawn cron task instance');
      }
    }

    return { spawned };
  }
}

// ── Singleton ─────────────────────────────────────────────────
export const cronManager = new CronManager();
