import { BaseLLMProvider, type LLMProviderConfig } from './base.js';
import { env } from '../../config/env.js';

/**
 * Pricing per token (USD) for common Together AI models.
 * Format: { model: [promptPerToken, completionPerToken] }
 */
const PRICING: Record<string, [prompt: number, completion: number]> = {
  'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo':   [0.18e-6, 0.18e-6],
  'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo':  [0.88e-6, 0.88e-6],
  'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo': [3.5e-6,  3.5e-6],
  'mistralai/Mixtral-8x7B-Instruct-v0.1':          [0.6e-6,  0.6e-6],
  'mistralai/Mistral-7B-Instruct-v0.3':            [0.2e-6,  0.2e-6],
  'Qwen/Qwen2-72B-Instruct':                       [0.9e-6,  0.9e-6],
};

/** Default fallback pricing when model isn't in the lookup table */
const DEFAULT_PRICING: [number, number] = [0.3e-6, 0.3e-6];

export class TogetherAIProvider extends BaseLLMProvider {
  constructor(config?: Partial<LLMProviderConfig>) {
    super({
      name: config?.name ?? 'togetherai',
      baseUrl: config?.baseUrl ?? 'https://api.together.xyz/v1',
      apiKey: config?.apiKey ?? env.TOGETHERAI_API_KEY,
      defaultModel: config?.defaultModel ?? 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      models: config?.models ?? [
        'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
        'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo',
        'mistralai/Mixtral-8x7B-Instruct-v0.1',
        'mistralai/Mistral-7B-Instruct-v0.3',
        'Qwen/Qwen2-72B-Instruct',
      ],
    });
  }

  estimateCost(
    usage: { prompt_tokens: number; completion_tokens: number },
    model: string,
  ): number {
    const [promptRate, completionRate] = PRICING[model] ?? DEFAULT_PRICING;
    return usage.prompt_tokens * promptRate + usage.completion_tokens * completionRate;
  }
}
