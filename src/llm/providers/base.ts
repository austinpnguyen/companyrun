import { createLogger } from '../../shared/logger.js';
import { ServiceUnavailableError, RateLimitError, AppError } from '../../shared/errors.js';
import { sleep } from '../../shared/utils.js';

const log = createLogger('llm:provider');

// ============================================================
// Interfaces
// ============================================================

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMChatOptions {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  tools?: LLMTool[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  stream?: boolean;
}

export interface LLMChatResponse {
  id: string;
  model: string;
  choices: {
    message: LLMMessage;
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  models: string[];
}

export interface ILLMProvider {
  readonly name: string;
  readonly config: LLMProviderConfig;
  chat(options: LLMChatOptions): Promise<LLMChatResponse>;
  listModels(): Promise<string[]>;
  isAvailable(): Promise<boolean>;
  estimateCost(usage: { prompt_tokens: number; completion_tokens: number }, model: string): number;
}

// ============================================================
// Abstract Base Provider
// ============================================================

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

/**
 * Abstract base class for OpenAI-compatible LLM providers.
 * Handles HTTP calls, retries with exponential backoff, logging,
 * and error classification. Subclasses implement `estimateCost()`
 * and optionally override `buildHeaders()` for custom auth headers.
 */
export abstract class BaseLLMProvider implements ILLMProvider {
  public readonly name: string;
  public readonly config: LLMProviderConfig;

  constructor(config: LLMProviderConfig) {
    this.name = config.name;
    this.config = config;
  }

  // ----------------------------------------------------------
  // Overridable: extra headers (e.g. OpenRouter's HTTP-Referer)
  // ----------------------------------------------------------

  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  // ----------------------------------------------------------
  // Core chat completion with retry logic
  // ----------------------------------------------------------

  async chat(options: LLMChatOptions): Promise<LLMChatResponse> {
    const model = options.model || this.config.defaultModel;
    const url = `${this.config.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model,
      messages: options.messages,
    };

    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.max_tokens !== undefined) body.max_tokens = options.max_tokens;
    if (options.tools !== undefined) body.tools = options.tools;
    if (options.tool_choice !== undefined) body.tool_choice = options.tool_choice;
    if (options.stream !== undefined) body.stream = options.stream;

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        log.debug({ provider: this.name, model, attempt }, 'LLM request');

        const startMs = Date.now();
        const response = await fetch(url, {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(body),
        });

        const latencyMs = Date.now() - startMs;

        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : BASE_BACKOFF_MS * Math.pow(2, attempt - 1);

          log.warn(
            { provider: this.name, attempt, waitMs },
            'Rate limited — backing off',
          );

          if (attempt < MAX_RETRIES) {
            await sleep(waitMs);
            continue;
          }
          throw new RateLimitError(this.name);
        }

        if (!response.ok) {
          const errorBody = await response.text();
          log.error(
            { provider: this.name, status: response.status, body: errorBody },
            'LLM API error',
          );

          if (response.status >= 500 && attempt < MAX_RETRIES) {
            await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
            continue;
          }

          throw new AppError(
            `LLM provider ${this.name} returned ${response.status}: ${errorBody}`,
            response.status,
          );
        }

        const data = (await response.json()) as LLMChatResponse;

        log.debug(
          {
            provider: this.name,
            model: data.model,
            latencyMs,
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
          },
          'LLM response received',
        );

        return data;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (except 429 handled above)
        if (error instanceof AppError && error.statusCode < 500 && !(error instanceof RateLimitError)) {
          throw error;
        }

        if (attempt < MAX_RETRIES) {
          const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
          log.warn(
            { provider: this.name, attempt, error: (error as Error).message, backoffMs: backoff },
            'Retrying LLM request',
          );
          await sleep(backoff);
        }
      }
    }

    log.error(
      { provider: this.name, error: lastError?.message },
      'All LLM retry attempts exhausted',
    );
    throw lastError ?? new ServiceUnavailableError(this.name);
  }

  // ----------------------------------------------------------
  // Model listing — returns configured models by default
  // ----------------------------------------------------------

  async listModels(): Promise<string[]> {
    return this.config.models;
  }

  // ----------------------------------------------------------
  // Availability check — pings the models endpoint
  // ----------------------------------------------------------

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      log.warn({ provider: this.name }, 'Provider availability check failed');
      return false;
    }
  }

  // ----------------------------------------------------------
  // Cost estimation — must be implemented by each provider
  // ----------------------------------------------------------

  abstract estimateCost(
    usage: { prompt_tokens: number; completion_tokens: number },
    model: string,
  ): number;
}
