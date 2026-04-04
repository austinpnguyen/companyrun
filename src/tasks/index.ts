// ============================================================
// Tasks module — clean re-exports
// ============================================================

// Task Manager — CRUD + lifecycle
export { TaskManager, taskManager } from './manager.js';
export type { CreateTaskParams, UpdateTaskParams } from './manager.js';

// Task Queue — in-memory priority queue
export { TaskQueue, taskQueue } from './queue.js';
export type { QueuedTask } from './queue.js';

// Task Decomposer — LLM-powered breakdown
export { TaskDecomposer, taskDecomposer } from './decomposer.js';
export type { DecompositionResult } from './decomposer.js';

// Task Reviewer — quality review
export { TaskReviewer, taskReviewer } from './reviewer.js';
export type { ReviewResult } from './reviewer.js';
