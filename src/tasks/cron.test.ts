// ============================================================
// CronManager — nextCronRun unit tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { nextCronRun } from './cron.js';

describe('nextCronRun', () => {
  const base = new Date('2025-04-04T10:00:00Z');

  it('every N minutes: */5 * * * *', () => {
    const next = nextCronRun('*/5 * * * *', base);
    expect(next.getTime()).toBe(new Date('2025-04-04T10:05:00Z').getTime());
  });

  it('every 30 minutes: */30 * * * *', () => {
    const next = nextCronRun('*/30 * * * *', base);
    expect(next.getTime()).toBe(new Date('2025-04-04T10:30:00Z').getTime());
  });

  it('every minute: * * * * *', () => {
    const next = nextCronRun('* * * * *', base);
    expect(next.getTime()).toBe(new Date('2025-04-04T10:01:00Z').getTime());
  });

  it('every 2 hours at :00: 0 */2 * * *', () => {
    const next = nextCronRun('0 */2 * * *', base);
    expect(next.getTime()).toBe(new Date('2025-04-04T12:00:00Z').getTime());
  });

  it('daily at 9am UTC: 0 9 * * *', () => {
    // base is 10:00 UTC → same-day 9am is in the past → next day
    const next = nextCronRun('0 9 * * *', base);
    expect(next.getTime()).toBe(new Date('2025-04-05T09:00:00Z').getTime());
  });

  it('falls back to every hour for unknown expression', () => {
    const next = nextCronRun('invalid expression here X', base);
    // Should add 1 hour
    expect(next > base).toBe(true);
  });
});
