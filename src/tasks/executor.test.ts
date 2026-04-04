// ============================================================
// TaskExecutor unit tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing TaskExecutor
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
    cancelAgent: vi.fn(),
  },
}));

vi.mock('./manager.js', () => ({
  taskManager: {
    start: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
    unassign: vi.fn(),
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
import { TaskExecutor } from './executor.js';

// Helper to set up db.select() to return an empty array of tasks
function mockEmptyTaskSelect() {
  const mockChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  vi.mocked(db.select).mockReturnValue(mockChain as any);
}

describe('TaskExecutor', () => {
  let executor: TaskExecutor;

  beforeEach(() => {
    executor = new TaskExecutor();
    vi.clearAllMocks();
  });

  it('runningCount starts at 0', () => {
    expect(executor.runningCount).toBe(0);
  });

  it('executeAssignedTasks returns { started: 0, running: 0 } when no tasks in DB', async () => {
    mockEmptyTaskSelect();

    const result = await executor.executeAssignedTasks();

    expect(result).toEqual({ started: 0, running: 0 });
  });

  it('runningTasks Set prevents double-execution of the same taskId', async () => {
    // Simulate a task already in-flight
    const taskId = 'task-123';

    // Access private runningTasks via bracket notation for test purposes
    (executor as any).runningTasks.add(taskId);

    // DB returns the same task
    const mockTask = {
      id: taskId,
      title: 'Test task',
      status: 'assigned',
      assignedAgentId: 'agent-abc',
      description: null,
      priority: 'normal',
      complexity: 1,
      requiredSkills: [],
      result: null,
      createdBy: 'user',
      parentTaskId: null,
      deadline: null,
      creditReward: '10.00',
      startedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockTask]),
    };
    vi.mocked(db.select).mockReturnValue(mockChain as any);

    const result = await executor.executeAssignedTasks();

    // task is filtered out because it's already in runningTasks
    expect(result.started).toBe(0);
    expect(executor.runningCount).toBe(1); // still has the pre-existing task
  });
});
