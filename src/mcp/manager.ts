// ============================================================
// MCP Manager — High-level MCP lifecycle orchestrator
// ============================================================

import { createLogger } from '../shared/logger.js';
import { NotFoundError } from '../shared/errors.js';
import { mcpRegistry } from './registry.js';
import { mcpConnector } from './connector.js';
import type { MCPSkillDefinition } from './registry.js';
import type { MCPToolInfo } from './connector.js';
import type { LLMTool } from '../llm/providers/base.js';

const log = createLogger('mcp:manager');

// ============================================================
// MCPManager
// ============================================================

export class MCPManager {
  private initialized = false;

  // ----------------------------------------------------------
  // Initialize: load all skills from registry
  // ----------------------------------------------------------

  async initialize(): Promise<void> {
    if (this.initialized) {
      log.debug('MCP Manager already initialized');
      return;
    }

    log.info('Initializing MCP Manager — loading skill catalog');

    try {
      const allSkills = await mcpRegistry.loadSkills();
      log.info(
        { skillCount: allSkills.length },
        'MCP Manager initialized — skill catalog loaded',
      );
      this.initialized = true;
    } catch (error) {
      log.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to initialize MCP Manager',
      );
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Connect all skills assigned to an agent
  // ----------------------------------------------------------

  async connectAgentSkills(agentId: string): Promise<void> {
    const agentSkills = await mcpRegistry.getAgentSkills(agentId);

    if (agentSkills.length === 0) {
      log.debug({ agentId }, 'Agent has no assigned skills to connect');
      return;
    }

    log.info(
      { agentId, skillCount: agentSkills.length },
      'Connecting agent skills',
    );

    for (const skill of agentSkills) {
      try {
        await mcpConnector.connect(agentId, skill);
      } catch (error) {
        // Log but don't crash — partial connectivity is acceptable
        log.error(
          {
            error: error instanceof Error ? error.message : String(error),
            agentId,
            skillId: skill.id,
            skillName: skill.name,
          },
          'Failed to connect MCP skill for agent (continuing with remaining skills)',
        );
      }
    }

    const status = mcpConnector.getConnectionStatus(agentId);
    const connectedCount = status.filter((s) => s.connected).length;

    log.info(
      {
        agentId,
        totalSkills: agentSkills.length,
        connectedSkills: connectedCount,
      },
      'Agent skill connections complete',
    );
  }

  // ----------------------------------------------------------
  // Learn a new skill: assign to agent + connect MCP server
  // ----------------------------------------------------------

  async learnSkill(
    agentId: string,
    skillNameOrId: string,
  ): Promise<{ skill: MCPSkillDefinition; tools: MCPToolInfo[] }> {
    // Look up the skill
    const skill = await mcpRegistry.getSkill(skillNameOrId);
    if (!skill) {
      throw new NotFoundError('Skill', skillNameOrId);
    }

    // Assign the skill to the agent in DB
    await mcpRegistry.assignSkillToAgent(agentId, skill.id);

    // Connect to the MCP server
    const connection = await mcpConnector.connect(agentId, skill);

    log.info(
      {
        agentId,
        skillId: skill.id,
        skillName: skill.name,
        toolCount: connection.tools.length,
      },
      'Agent learned new skill',
    );

    return {
      skill,
      tools: connection.tools,
    };
  }

  // ----------------------------------------------------------
  // Forget a skill: disconnect + remove assignment
  // ----------------------------------------------------------

  async forgetSkill(agentId: string, skillNameOrId: string): Promise<void> {
    // Look up the skill
    const skill = await mcpRegistry.getSkill(skillNameOrId);
    if (!skill) {
      throw new NotFoundError('Skill', skillNameOrId);
    }

    // Disconnect the MCP server
    await mcpConnector.disconnect(agentId, skill.id);

    // Remove from DB
    await mcpRegistry.removeSkillFromAgent(agentId, skill.id);

    log.info(
      { agentId, skillId: skill.id, skillName: skill.name },
      'Agent forgot skill',
    );
  }

  // ----------------------------------------------------------
  // Get all LLM-formatted tools available to an agent
  // ----------------------------------------------------------

  async getAgentLLMTools(agentId: string): Promise<LLMTool[]> {
    const tools = await mcpConnector.getAgentTools(agentId);
    return mcpConnector.toolsToLLMFormat(tools);
  }

  // ----------------------------------------------------------
  // Execute a tool for an agent (routes to the correct MCP server)
  // ----------------------------------------------------------

  async executeTool(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    return mcpConnector.executeTool(agentId, toolName, args);
  }

  // ----------------------------------------------------------
  // Cleanup: disconnect everything for an agent (used when firing)
  // ----------------------------------------------------------

  async cleanupAgent(agentId: string): Promise<void> {
    await mcpConnector.disconnectAgent(agentId);

    log.info({ agentId }, 'MCP cleanup complete for agent');
  }

  // ----------------------------------------------------------
  // Cleanup: disconnect everything (used on shutdown)
  // ----------------------------------------------------------

  async shutdownAll(): Promise<void> {
    log.info('Shutting down all MCP connections');

    await mcpConnector.disconnectAll();

    this.initialized = false;

    log.info('MCP Manager shut down');
  }

  // ----------------------------------------------------------
  // Get the skill catalog (for the frontend)
  // ----------------------------------------------------------

  async getSkillCatalog(): Promise<MCPSkillDefinition[]> {
    return mcpRegistry.loadSkills();
  }

  // ----------------------------------------------------------
  // Register a new skill in the catalog
  // ----------------------------------------------------------

  async registerSkill(
    skill: Omit<MCPSkillDefinition, 'id'>,
  ): Promise<MCPSkillDefinition> {
    return mcpRegistry.registerSkill(skill);
  }

  // ----------------------------------------------------------
  // Get connection status for an agent
  // ----------------------------------------------------------

  getAgentConnectionStatus(
    agentId: string,
  ): { skillId: string; skillName: string; connected: boolean }[] {
    return mcpConnector.getConnectionStatus(agentId);
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const mcpManager = new MCPManager();
