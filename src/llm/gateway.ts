import { createLogger } from '../shared/logger.js';
import { NotFoundError, ServiceUnavailableError } from '../shared/errors.js';
import type { ILLMProvider, LLMChatOptions, LLMChatResponse } from './providers/base.js';

const log = createLogger('llm:gateway');

// ============================================================
// Provider recommendation map
// ============================================================

const TASK_PROVIDER_MAP: Record<string, string[]> = {
  code:     ['askcodi', 'openrouter', 'togetherai', '9router'],
  writing:  ['openrouter', 'togetherai', '9router', 'askcodi'],
  analysis: ['openrouter', 'togetherai', '9router', 'askcodi'],
  general:  ['openrouter', 'togetherai', 'askcodi', '9router'],
};

// ============================================================
// LLMGateway
// ============================================================

export class LLMGateway {
  private providers: Map<string, ILLMProvider> = new Map();
  private fallbackOrder: string[] = [];

  // ----------------------------------------------------------
  // Provider management
  // ----------------------------------------------------------

  registerProvider(provider: ILLMProvider): void {
    this.providers.set(provider.name, provider);

    // Keep fallback order in sync — append new providers at the end
    if (!this.fallbackOrder.includes(provider.name)) {
      this.fallbackOrder.push(provider.name);
    }

    log.info({ provider: provider.name, models: provider.config.models.length }, 'Provider registered');
  }

  removeProvider(name: string): void {
    this.providers.delete(name);
    this.fallbackOrder = this.fallbackOrder.filter((n) => n !== name);
    log.info({ provider: name }, 'Provider removed');
  }

  getProvider(name: string): ILLMProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new NotFoundError('LLM provider', name);
    }
    return provider;
  }

  // ----------------------------------------------------------
  // Chat — route to a specific provider
  // ----------------------------------------------------------

  async chat(options: LLMChatOptions & { provider?: string }): Promise<LLMChatResponse> {
    const providerName = options.provider ?? this.fallbackOrder[0];

    if (!providerName) {
      throw new ServiceUnavailableError('No LLM providers registered');
    }

    const provider = this.getProvider(providerName);

    log.debug(
      { provider: providerName, model: options.model },
      'Routing chat request',
    );

    return provider.chat(options);
  }

  // ----------------------------------------------------------
  // Chat with automatic fallback
  // ----------------------------------------------------------

  async chatWithFallback(
    options: LLMChatOptions,
    preferredProviders?: string[],
  ): Promise<LLMChatResponse> {
    const order = preferredProviders?.length
      ? preferredProviders
      : this.fallbackOrder;

    if (order.length === 0) {
      throw new ServiceUnavailableError('No LLM providers registered');
    }

    const errors: Array<{ provider: string; error: string }> = [];

    for (const name of order) {
      const provider = this.providers.get(name);
      if (!provider) continue;

      try {
        log.debug({ provider: name }, 'Attempting chat with provider');
        return await provider.chat(options);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({ provider: name, error: msg });
        log.warn({ provider: name, error: msg }, 'Provider failed — trying next');
      }
    }

    log.error({ errors }, 'All providers failed');
    throw new ServiceUnavailableError(
      `All LLM providers failed: ${errors.map((e) => `${e.provider}(${e.error})`).join(', ')}`,
    );
  }

  // ----------------------------------------------------------
  // List providers + availability
  // ----------------------------------------------------------

  async listProviders(): Promise<
    Array<{ name: string; models: string[]; available: boolean }>
  > {
    const results = await Promise.all(
      Array.from(this.providers.values()).map(async (p) => ({
        name: p.name,
        models: p.config.models,
        available: await p.isAvailable(),
      })),
    );
    return results;
  }

  // ----------------------------------------------------------
  // Recommend a provider for a task type
  // ----------------------------------------------------------

  recommendProvider(taskType: 'code' | 'writing' | 'analysis' | 'general'): string {
    const preferred = TASK_PROVIDER_MAP[taskType] ?? TASK_PROVIDER_MAP.general;

    for (const name of preferred) {
      if (this.providers.has(name)) {
        return name;
      }
    }

    // Fall back to the first registered provider
    const first = this.fallbackOrder[0];
    if (!first) {
      throw new ServiceUnavailableError('No LLM providers registered');
    }
    return first;
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const llmGateway = new LLMGateway();
