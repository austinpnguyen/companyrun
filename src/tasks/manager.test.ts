// ============================================================
// TaskManager.cancel() unit tests
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

vi.mock('../config/env.js', () => ({
  env: {
    DEFAULT_TASK_REWARD: 10,
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
import { TaskManager } from './manager.js';
import { ConflictError, NotFoundError } from '../shared/errors.js';

// Build a minimal fake Task record
function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-abc',
    title: 'Test task',
    description: null,
    priority: 'normal',
    complexity: 1,
    status: 'in_progress',
    assignedAgentId: 'agent-001',
    requiredSkills: [],
    result: null,
    creditReward: '10.00',
    createdBy: 'user',
    parentTaskId: null,
    deadline: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helpers to set up db mock chains
function mockGetById(task: ReturnType<typeof makeTask> | null) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(task ? [task] : []),
  };
  vi.mocked(db.select).mockReturnValue(chain as any);
}

function mockUpdateReturning(updated: ReturnType<typeof makeTask>) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([updated]),
  };
  vi.mocked(db.update).mockReturnValue(chain as any);
}

function mockInsert() {
  const chain = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  vi.mocked(db.insert).mockReturnValue(chain as any);
}

describe('TaskManager.cancel()', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
    vi.clearAllMocks();
  });

  it('throws ConflictError when task is already completed', async () => {
    const completedTask = makeTask({ status: 'completed' });

    mockGetById(completedTask);

    await expect(manager.cancel('task-abc')).rejects.toThrow(ConflictError);
    await expect(manager.cancel('task-abc')).rejects.toThrow('terminal state');
  });

  it('throws ConflictError when task is already cancelled', async () => {
    const cancelledTask = makeTask({ status: 'cancelled' });

    mockGetById(cancelledTask);

    await expect(manager.cancel('task-abc')).rejects.toThrow(ConflictError);
    await expect(manager.cancel('task-abc')).rejects.toThrow('terminal state');
  });

  it('throws ConflictError when task is already failed', async () => {
    const failedTask = makeTask({ status: 'failed' });

    mockGetById(failedTask);

    await expect(manager.cancel('task-abc')).rejects.toThrow(ConflictError);
  });

  it('transitions in_progress task to cancelled successfully', async () => {
    const inProgressTask = makeTask({ status: 'in_progress' });
    const cancelledTask = makeTask({ status: 'cancelled' });

    // getById is called twice: once in cancel(), once inside transition()
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([inProgressTask])  // cancel() → getById
        .mockResolvedValueOnce([inProgressTask]), // transition() → getById
    };
    vi.mocked(db.select).mockReturnValue(selectChain as any);

    mockUpdateReturning(cancelledTask);
    mockInsert();

    const result = await manager.cancel('task-abc');

    expect(result.status).toBe('cancelled');
  });

  it('throws NotFoundError when task does not exist', async () => {
    mockGetById(null);

    await expect(manager.cancel('nonexistent-id')).rejects.toThrow(NotFoundError);
  });
});
