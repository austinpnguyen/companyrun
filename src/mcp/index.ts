// ============================================================
// MCP System — public API
// ============================================================

// Manager (primary interface — other modules should use this)
export { MCPManager, mcpManager } from './manager.js';

// Connector
export { MCPConnector, mcpConnector } from './connector.js';

// Registry
export { MCPRegistry, mcpRegistry } from './registry.js';

// Types
export type { MCPSkillDefinition } from './registry.js';
export type { MCPConnection, MCPToolInfo } from './connector.js';
