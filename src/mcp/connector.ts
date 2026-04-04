// ============================================================
// MCP Connector — Dynamic MCP client connections
// ============================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createLogger } from '../shared/logger.js';
import type { LLMTool } from '../llm/providers/base.js';
import type { MCPSkillDefinition } from './registry.js';

const log = createLogger('mcp:connector');

// ============================================================
// Types
// ============================================================

export interface MCPConnection {
  skillId: string;
  skillName: string;
  client: Client;
  transport: StdioClientTransport;
  tools: MCPToolInfo[];
  connected: boolean;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ============================================================
// MCPConnector
// ============================================================

export class MCPConnector {
  /** Active connections keyed by `${agentId}:${skillId}` */
  private connections: Map<string, MCPConnection> = new Map();

  // ----------------------------------------------------------
  // Connect to an MCP server for a specific agent
  // ----------------------------------------------------------

  async connect(
    agentId: string,
    skill: MCPSkillDefinition,
  ): Promise<MCPConnection> {
    const connectionKey = `${agentId}:${skill.id}`;

    // Return existing connection if already active
    const existing = this.connections.get(connectionKey);
    if (existing?.connected) {
      log.debug(
        { agentId, skillId: skill.id, skillName: skill.name },
        'Reusing existing MCP connection',
      );
      return existing;
    }

    log.info(
      {
        agentId,
        skillId: skill.id,
        skillName: skill.name,
        command: skill.serverCommand,
        args: skill.serverArgs,
      },
      'Connecting to MCP server',
    );

    try {
      // Build environment variables for the child process
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...(skill.serverEnv ?? {}),
      };

      // Create transport — spawns the MCP server as a child process
      const transport = new StdioClientTransport({
        command: skill.serverCommand,
        args: skill.serverArgs,
        env,
      });

      // Create MCP client
      const client = new Client({
        name: `companyrun-agent-${agentId}`,
        version: '1.0.0',
      });

      // Connect the client to the transport
      await client.connect(transport);

      // Discover available tools from the MCP server
      const toolsResult = await client.listTools();
      const tools: MCPToolInfo[] = (toolsResult.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {},
      }));

      log.info(
        {
          agentId,
          skillId: skill.id,
          skillName: skill.name,
          toolCount: tools.length,
          toolNames: tools.map((t) => t.name),
        },
        'MCP server connected — tools discovered',
      );

      const connection: MCPConnection = {
        skillId: skill.id,
        skillName: skill.name,
        client,
        transport,
        tools,
        connected: true,
      };

      this.connections.set(connectionKey, connection);
      return connection;
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId,
          skillId: skill.id,
          skillName: skill.name,
        },
        'Failed to connect to MCP server',
      );
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Disconnect a specific connection
  // ----------------------------------------------------------

  async disconnect(agentId: string, skillId: string): Promise<void> {
    const connectionKey = `${agentId}:${skillId}`;
    const connection = this.connections.get(connectionKey);

    if (!connection) {
      log.debug({ agentId, skillId }, 'No connection found to disconnect');
      return;
    }

    try {
      await connection.client.close();
      log.info(
        { agentId, skillId, skillName: connection.skillName },
        'MCP connection closed',
      );
    } catch (error) {
      log.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId,
          skillId,
        },
        'Error closing MCP connection (proceeding with cleanup)',
      );
    }

    connection.connected = false;
    this.connections.delete(connectionKey);
  }

  // ----------------------------------------------------------
  // Disconnect ALL connections for an agent
  // ----------------------------------------------------------

  async disconnectAgent(agentId: string): Promise<void> {
    const prefix = `${agentId}:`;
    const keysToRemove: string[] = [];

    for (const [key, connection] of this.connections) {
      if (key.startsWith(prefix)) {
        keysToRemove.push(key);
        try {
          await connection.client.close();
        } catch (error) {
          log.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              agentId,
              skillId: connection.skillId,
            },
            'Error closing MCP connection during agent disconnect',
          );
        }
        connection.connected = false;
      }
    }

    for (const key of keysToRemove) {
      this.connections.delete(key);
    }

    log.info(
      { agentId, disconnectedCount: keysToRemove.length },
      'All MCP connections disconnected for agent',
    );
  }

  // ----------------------------------------------------------
  // Execute a tool call on a connected MCP server
  // ----------------------------------------------------------

  async executeTool(
    agentId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    // Find which connection owns this tool
    const prefix = `${agentId}:`;
    let targetConnection: MCPConnection | undefined;

    for (const [key, connection] of this.connections) {
      if (key.startsWith(prefix) && connection.connected) {
        const hasTool = connection.tools.some((t) => t.name === toolName);
        if (hasTool) {
          targetConnection = connection;
          break;
        }
      }
    }

    if (!targetConnection) {
      throw new Error(
        `No connected MCP server found for tool "${toolName}" (agent: ${agentId})`,
      );
    }

    log.debug(
      {
        agentId,
        toolName,
        skillId: targetConnection.skillId,
        skillName: targetConnection.skillName,
      },
      'Executing MCP tool',
    );

    try {
      const result = await targetConnection.client.callTool({
        name: toolName,
        arguments: args,
      });

      log.debug(
        {
          agentId,
          toolName,
          skillName: targetConnection.skillName,
        },
        'MCP tool executed successfully',
      );

      return result;
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId,
          toolName,
          skillName: targetConnection.skillName,
        },
        'MCP tool execution failed',
      );
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Get all available tools for an agent
  // ----------------------------------------------------------

  async getAgentTools(agentId: string): Promise<MCPToolInfo[]> {
    const prefix = `${agentId}:`;
    const allTools: MCPToolInfo[] = [];

    for (const [key, connection] of this.connections) {
      if (key.startsWith(prefix) && connection.connected) {
        allTools.push(...connection.tools);
      }
    }

    return allTools;
  }

  // ----------------------------------------------------------
  // Convert MCP tools to the LLMTool format
  // ----------------------------------------------------------

  toolsToLLMFormat(tools: MCPToolInfo[]): LLMTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  // ----------------------------------------------------------
  // Check if a specific connection is healthy
  // ----------------------------------------------------------

  async isConnectionHealthy(
    agentId: string,
    skillId: string,
  ): Promise<boolean> {
    const connectionKey = `${agentId}:${skillId}`;
    const connection = this.connections.get(connectionKey);

    if (!connection || !connection.connected) {
      return false;
    }

    try {
      // Ping the server by listing tools — lightweight health check
      await connection.client.listTools();
      return true;
    } catch {
      log.warn(
        { agentId, skillId, skillName: connection.skillName },
        'MCP connection health check failed',
      );
      connection.connected = false;
      return false;
    }
  }

  // ----------------------------------------------------------
  // Reconnect a failed connection
  // ----------------------------------------------------------

  async reconnect(
    agentId: string,
    skillId: string,
    skill: MCPSkillDefinition,
  ): Promise<void> {
    // First disconnect cleanly
    await this.disconnect(agentId, skillId);

    // Then reconnect
    await this.connect(agentId, skill);

    log.info(
      { agentId, skillId, skillName: skill.name },
      'MCP connection re-established',
    );
  }

  // ----------------------------------------------------------
  // Get connection status for an agent
  // ----------------------------------------------------------

  getConnectionStatus(
    agentId: string,
  ): { skillId: string; skillName: string; connected: boolean }[] {
    const prefix = `${agentId}:`;
    const statuses: { skillId: string; skillName: string; connected: boolean }[] = [];

    for (const [key, connection] of this.connections) {
      if (key.startsWith(prefix)) {
        statuses.push({
          skillId: connection.skillId,
          skillName: connection.skillName,
          connected: connection.connected,
        });
      }
    }

    return statuses;
  }

  // ----------------------------------------------------------
  // Disconnect all connections (used on shutdown)
  // ----------------------------------------------------------

  async disconnectAll(): Promise<void> {
    const count = this.connections.size;

    for (const [, connection] of this.connections) {
      try {
        await connection.client.close();
      } catch (error) {
        log.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            skillId: connection.skillId,
            skillName: connection.skillName,
          },
          'Error closing MCP connection during shutdown',
        );
      }
      connection.connected = false;
    }

    this.connections.clear();

    log.info({ disconnectedCount: count }, 'All MCP connections shut down');
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const mcpConnector = new MCPConnector();
