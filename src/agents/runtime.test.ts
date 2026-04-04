// ============================================================
// AgentRuntime cancellation tests
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../llm/gateway.js', () => ({
  llmGateway: {
    chat: vi.fn(),
    getProvider: vi.fn(),
  },
}));

vi.mock('../llm/tracker.js', () => ({
  llmUsageTracker: {
    trackUsage: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('./memory.js', () => {
  const AgentMemory = vi.fn(function (this: Record<string, unknown>) {
    this.ensureConversation = vi.fn().mockResolvedValue('conv-id');
    this.addMessage = vi.fn().mockResolvedValue(undefined);
    this.buildContext = vi.fn().mockResolvedValue([
      { role: 'system', content: 'You are a helpful assistant.' },
    ]);
  });
  return { AgentMemory };
});

vi.mock('../mcp/manager.js', () => ({
  mcpManager: {
    connectAgentSkills: vi.fn().mockResolvedValue(undefined),
    getAgentLLMTools: vi.fn().mockResolvedValue([]),
    cleanupAgent: vi.fn().mockResolvedValue(undefined),
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

import { AgentRuntime } from './runtime.js';
import { llmGateway } from '../llm/gateway.js';
import type { AgentRuntimeConfig } from './runtime.js';

function makeConfig(overrides: Partial<AgentRuntimeConfig> = {}): AgentRuntimeConfig {
  return {
    agentId: 'agent-test-001',
    name: 'Test Agent',
    role: 'developer',
    systemPrompt: 'You are a test agent.',
    provider: 'openrouter',
    model: 'openai/gpt-4o',
    personality: {
      creativity: 0.5,
      verbosity: 'normal',
      tone: 'professional',
    },
    tools: [],
    ...overrides,
  };
}

describe('AgentRuntime cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets isCancelled to true and stops further processing when cancel() is called', async () => {
    const runtime = new AgentRuntime(makeConfig());

    // Mock the LLM to return a valid response on first call
    vi.mocked(llmGateway.chat).mockResolvedValue({
      choices: [
        {
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
          index: 0,
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      id: 'resp-001',
      model: 'gpt-4o',
      object: 'chat.completion',
    } as any);

    vi.mocked(llmGateway.getProvider).mockReturnValue({
      estimateCost: vi.fn().mockReturnValue(0.001),
    } as any);

    // Cancel before processing
    runtime.cancel();

    // Processing a message after cancel() should throw 'Agent cancelled'
    await expect(
      runtime.processMessage('conv-001', 'Do something'),
    ).rejects.toThrow('Agent cancelled');

    // LLM should never have been called
    expect(llmGateway.chat).not.toHaveBeenCalled();
  });

  it('processes normally before cancel() is called', async () => {
    const runtime = new AgentRuntime(makeConfig());

    vi.mocked(llmGateway.chat).mockResolvedValue({
      choices: [
        {
          message: { role: 'assistant', content: 'Task done.' },
          finish_reason: 'stop',
          index: 0,
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      id: 'resp-002',
      model: 'gpt-4o',
      object: 'chat.completion',
    } as any);

    vi.mocked(llmGateway.getProvider).mockReturnValue({
      estimateCost: vi.fn().mockReturnValue(0.001),
    } as any);

    // Should NOT throw before cancel
    const result = await runtime.processMessage('conv-001', 'Do something');
    expect(result.response).toBe('Task done.');
  });

  it('throws Agent cancelled on the next iteration after cancel() during a tool-call loop', async () => {
    const runtime = new AgentRuntime(makeConfig());

    // First call: returns a tool call — then we cancel mid-loop
    vi.mocked(llmGateway.chat)
      .mockImplementationOnce(async () => {
        // Cancel during the first LLM call to simulate mid-flight cancellation
        runtime.cancel();
        return {
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-001',
                    type: 'function',
                    function: { name: 'some_tool', arguments: '{}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
              index: 0,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          id: 'resp-003',
          model: 'gpt-4o',
          object: 'chat.completion',
        } as any;
      });

    await expect(
      runtime.processMessage('conv-002', 'Use a tool'),
    ).rejects.toThrow('Agent cancelled');
  });
});
