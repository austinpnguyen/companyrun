// ============================================================
// AdversarialPipeline unit tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../agents/manager.js', () => ({
  agentManager: {
    sendMessage: vi.fn(),
  },
}));

vi.mock('../shared/logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { db } from '../config/database.js';
import { AdversarialPipeline } from './adversarial.js';

/**
 * Build a fluent chain mock that resolves regardless of whether
 * the caller ends with .limit() or just .where().
 * Both the chain itself and the final methods are thenables.
 */
function makeSelectChain(rows: unknown[]) {
  const resolved = Promise.resolve(rows);
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  return chain;
}

describe('AdversarialPipeline', () => {
  let pipeline: AdversarialPipeline;

  beforeEach(() => {
    pipeline = new AdversarialPipeline();
    vi.clearAllMocks();
  });

  it('reviewingCount starts at 0', () => {
    expect(pipeline.reviewingCount).toBe(0);
  });

  it('reviewCompletedTasks returns { dispatched: 0 } when no completed tasks', async () => {
    vi.mocked(db.select).mockReturnValueOnce(makeSelectChain([]) as any);

    const result = await pipeline.reviewCompletedTasks();

    expect(result).toEqual({ dispatched: 0 });
  });

  it('reviewCompletedTasks returns { dispatched: 0 } when tasks exist but no adversarial agents', async () => {
    const completedTask = {
      id: 'task-001',
      title: 'Completed task',
      status: 'completed',
      assignedAgentId: 'agent-xyz',
      result: null,
      description: null,
      priority: 'normal',
      complexity: 1,
      requiredSkills: [],
      createdBy: 'user',
      parentTaskId: null,
      deadline: null,
      creditReward: '10.00',
      startedAt: null,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // First call: tasks query (ends with .limit())
    // Second call: agents query (ends with .where() — no .limit())
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([completedTask]) as any)
      .mockReturnValueOnce(makeSelectChain([]) as any);

    const result = await pipeline.reviewCompletedTasks();

    expect(result).toEqual({ dispatched: 0 });
  });

  it('adversarialStatus reviewing prevents re-dispatch (idempotency)', async () => {
    const alreadyReviewingTask = {
      id: 'task-002',
      title: 'Already reviewing task',
      status: 'completed',
      assignedAgentId: 'agent-xyz',
      result: { adversarialStatus: 'reviewing' },
      description: null,
      priority: 'normal',
      complexity: 1,
      requiredSkills: [],
      createdBy: 'user',
      parentTaskId: null,
      deadline: null,
      creditReward: '10.00',
      startedAt: null,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(db.select).mockReturnValueOnce(makeSelectChain([alreadyReviewingTask]) as any);

    const result = await pipeline.reviewCompletedTasks();

    // Filtered out because result.adversarialStatus is truthy
    expect(result).toEqual({ dispatched: 0 });
  });
});
