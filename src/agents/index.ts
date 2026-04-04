// ============================================================
// Agent System — public API
// ============================================================

// Manager (singleton + class)
export { AgentManager, agentManager } from './manager.js';

// Runtime
export { AgentRuntime } from './runtime.js';

// Memory
export { AgentMemory } from './memory.js';

// Templates
export { getBuiltinTemplates, getTemplateByRole } from './templates.js';

// Types
export type { AgentTemplate } from './templates.js';
export type { AgentRuntimeConfig, ProcessMessageResult } from './runtime.js';
