import { BaseLLMProvider, type LLMProviderConfig } from './base.js';
import { env } from '../../config/env.js';

/**
 * Pricing per token (USD) for common OpenRouter models.
 * Format: { model: [promptPerToken, completionPerToken] }
 */
const PRICING: Record<string, [prompt: number, completion: number]> = {
  'openai/gpt-4o':            [2.5e-6,  10e-6],
  'openai/gpt-4o-mini':       [0.15e-6, 0.6e-6],
  'openai/gpt-4-turbo':       [10e-6,   30e-6],
  'anthropic/claude-3.5-sonnet': [3e-6,  15e-6],
  'anthropic/claude-3-haiku':    [0.25e-6, 1.25e-6],
  'meta-llama/llama-3.1-70b-instruct': [0.52e-6, 0.75e-6],
  'meta-llama/llama-3.1-8b-instruct':  [0.055e-6, 0.055e-6],
  'google/gemini-pro-1.5':    [2.5e-6,  7.5e-6],
};

/** Default fallback pricing when model isn't in the lookup table */
const DEFAULT_PRICING: [number, number] = [1e-6, 2e-6];

export class OpenRouterProvider extends BaseLLMProvider {
  constructor(config?: Partial<LLMProviderConfig>) {
    super({
      name: config?.name ?? 'openrouter',
      baseUrl: config?.baseUrl ?? 'https://openrouter.ai/api/v1',
      apiKey: config?.apiKey ?? env.OPENROUTER_API_KEY,
      defaultModel: config?.defaultModel ?? 'openai/gpt-4o',
      models: config?.models ?? [
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3-haiku',
        'meta-llama/llama-3.1-70b-instruct',
        'meta-llama/llama-3.1-8b-instruct',
        'google/gemini-pro-1.5',
      ],
    });
  }

  /**
   * OpenRouter requires `HTTP-Referer` and `X-Title` headers in addition
   * to the standard Authorization header.
   */
  protected override buildHeaders(): Record<string, string> {
    return {
      ...super.buildHeaders(),
      'HTTP-Referer': 'https://companyrun.local',
      'X-Title': 'CompanyRun',
    };
  }

  estimateCost(
    usage: { prompt_tokens: number; completion_tokens: number },
    model: string,
  ): number {
    const [promptRate, completionRate] = PRICING[model] ?? DEFAULT_PRICING;
    return usage.prompt_tokens * promptRate + usage.completion_tokens * completionRate;
  }
}
