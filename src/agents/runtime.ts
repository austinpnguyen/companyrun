// ============================================================
// Agent Runtime — core execution loop for an agent
// ============================================================

import { createLogger } from '../shared/logger.js';
import { llmGateway } from '../llm/gateway.js';
import { llmUsageTracker } from '../llm/tracker.js';
import { AgentMemory } from './memory.js';
import { mcpManager } from '../mcp/manager.js';
import type { LLMMessage, LLMTool, ToolCall } from '../llm/providers/base.js';

const log = createLogger('agents:runtime');

/** Maximum iterations of the tool-call loop to prevent infinite loops */
const MAX_TOOL_ITERATIONS = 10;

// ============================================================
// Types
// ============================================================

export interface AgentRuntimeConfig {
  agentId: string;
  name: string;
  role: string;
  systemPrompt: string;
  provider: string;
  model: string;
  personality: {
    creativity: number;
    verbosity: string;
    tone: string;
  };
  tools: LLMTool[];
}

export interface ProcessMessageResult {
  response: string;
  toolCalls: { name: string; args: Record<string, unknown>; result: unknown }[];
  tokensUsed: { prompt: number; completion: number };
  cost: number;
}

// ============================================================
// AgentRuntime
// ============================================================

export class AgentRuntime {
  private config: AgentRuntimeConfig;
  private memory: AgentMemory;
  private _isRunning: boolean = false;
  private mcpToolsLoaded: boolean = false;

  constructor(config: AgentRuntimeConfig) {
    this.config = config;
    this.memory = new AgentMemory(config.agentId);
    this._isRunning = true;

    log.info(
      { agentId: config.agentId, name: config.name, role: config.role },
      'Agent runtime created',
    );
  }

  // ----------------------------------------------------------
  // Load MCP tools for this agent (connects skills + populates tools)
  // ----------------------------------------------------------

  async loadMCPTools(): Promise<void> {
    if (this.mcpToolsLoaded) return;

    try {
      // Connect all skills assigned to this agent
      await mcpManager.connectAgentSkills(this.config.agentId);

      // Get the LLM-formatted tools and update config
      const llmTools = await mcpManager.getAgentLLMTools(this.config.agentId);
      this.config.tools = llmTools;
      this.mcpToolsLoaded = true;

      log.info(
        {
          agentId: this.config.agentId,
          toolCount: llmTools.length,
          toolNames: llmTools.map((t) => t.function.name),
        },
        'MCP tools loaded for agent',
      );
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId: this.config.agentId,
        },
        'Failed to load MCP tools (agent will operate without tools)',
      );
    }
  }

  // ----------------------------------------------------------
  // Refresh MCP tools (after learning/forgetting a skill)
  // ----------------------------------------------------------

  async refreshMCPTools(): Promise<void> {
    this.mcpToolsLoaded = false;
    await this.loadMCPTools();
  }

  // ----------------------------------------------------------
  // Process a user message — full LLM interaction loop
  // ----------------------------------------------------------

  async processMessage(
    conversationId: string,
    userMessage: string,
  ): Promise<ProcessMessageResult> {
    if (!this._isRunning) {
      throw new Error(`Agent runtime ${this.config.agentId} is not running`);
    }

    // Lazily load MCP tools on first message
    if (!this.mcpToolsLoaded) {
      await this.loadMCPTools();
    }

    const startMs = Date.now();

    // Ensure the conversation exists in DB
    await this.memory.ensureConversation(conversationId);

    // Store the user message
    const userMsg: LLMMessage = { role: 'user', content: userMessage };
    await this.memory.addMessage(conversationId, userMsg);

    // Build context (system prompt + conversation history)
    const contextMessages = await this.memory.buildContext(
      conversationId,
      this.config.systemPrompt,
    );

    // Accumulate totals across iterations
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    const executedToolCalls: ProcessMessageResult['toolCalls'] = [];

    let currentMessages = [...contextMessages];
    let finalResponse = '';

    // Tool-call loop: send → check tool_calls → execute → send results → repeat
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      log.debug(
        {
          agentId: this.config.agentId,
          conversationId,
          iteration,
          messageCount: currentMessages.length,
        },
        'LLM request iteration',
      );

      // Call the LLM
      const llmResponse = await llmGateway.chat({
        provider: this.config.provider,
        model: this.config.model,
        messages: currentMessages,
        temperature: this.config.personality.creativity,
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        tool_choice: this.config.tools.length > 0 ? 'auto' : undefined,
      });

      // Track usage
      const usage = llmResponse.usage ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };
      totalPromptTokens += usage.prompt_tokens;
      totalCompletionTokens += usage.completion_tokens;

      // Estimate cost from the provider
      const provider = llmGateway.getProvider(this.config.provider);
      const iterationCost = provider.estimateCost(
        {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
        },
        this.config.model,
      );
      totalCost += iterationCost;

      // Track in usage tracker
      const latencyMs = Date.now() - startMs;
      await llmUsageTracker.trackUsage({
        provider: this.config.provider,
        model: this.config.model,
        agentId: this.config.agentId,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        costUsd: iterationCost,
        latencyMs,
      });

      const choice = llmResponse.choices[0];
      if (!choice) {
        log.warn(
          { agentId: this.config.agentId },
          'LLM returned no choices',
        );
        finalResponse = '';
        break;
      }

      const assistantMessage = choice.message;

      // Check if the LLM wants to call tools
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        // Store the assistant message with tool calls
        await this.memory.addMessage(conversationId, assistantMessage);
        currentMessages.push(assistantMessage);

        // Execute each tool call
        for (const toolCall of assistantMessage.tool_calls) {
          log.debug(
            {
              agentId: this.config.agentId,
              tool: toolCall.function.name,
            },
            'Executing tool call',
          );

          const toolResult = await this.executeTool(toolCall);

          // Parse args for the result record
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            parsedArgs = { raw: toolCall.function.arguments };
          }

          executedToolCalls.push({
            name: toolCall.function.name,
            args: parsedArgs,
            result: toolResult,
          });

          // Create tool result message for the LLM
          const toolResultMsg: LLMMessage = {
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          };

          await this.memory.addMessage(conversationId, toolResultMsg);
          currentMessages.push(toolResultMsg);
        }

        // Continue the loop — send tool results back to LLM
        continue;
      }

      // No tool calls — this is the final response
      finalResponse = assistantMessage.content ?? '';

      // Store the assistant response
      await this.memory.addMessage(conversationId, {
        role: 'assistant',
        content: finalResponse,
      });

      break;
    }

    log.info(
      {
        agentId: this.config.agentId,
        conversationId,
        toolCalls: executedToolCalls.length,
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        cost: totalCost.toFixed(6),
        latencyMs: Date.now() - startMs,
      },
      'Message processed',
    );

    return {
      response: finalResponse,
      toolCalls: executedToolCalls,
      tokensUsed: {
        prompt: totalPromptTokens,
        completion: totalCompletionTokens,
      },
      cost: totalCost,
    };
  }

  // ----------------------------------------------------------
  // Execute a tool call via MCP
  // ----------------------------------------------------------

  private async executeTool(toolCall: ToolCall): Promise<string> {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      const result = await mcpManager.executeTool(
        this.config.agentId,
        toolCall.function.name,
        args,
      );
      return JSON.stringify(result);
    } catch (error) {
      log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId: this.config.agentId,
          tool: toolCall.function.name,
        },
        'Tool execution failed',
      );
      return JSON.stringify({
        error: `Tool execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  // ----------------------------------------------------------
  // Stop the runtime (cleanup MCP connections)
  // ----------------------------------------------------------

  async stop(): Promise<void> {
    this._isRunning = false;

    // Cleanup MCP connections for this agent
    try {
      await mcpManager.cleanupAgent(this.config.agentId);
    } catch (error) {
      log.warn(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId: this.config.agentId,
        },
        'Error cleaning up MCP connections during runtime stop',
      );
    }

    log.info(
      { agentId: this.config.agentId, name: this.config.name },
      'Agent runtime stopped',
    );
  }

  // ----------------------------------------------------------
  // Getters
  // ----------------------------------------------------------

  get running(): boolean {
    return this._isRunning;
  }

  get agentId(): string {
    return this.config.agentId;
  }

  get agentName(): string {
    return this.config.name;
  }
}
