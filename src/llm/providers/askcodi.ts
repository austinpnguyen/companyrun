import { BaseLLMProvider, type LLMProviderConfig } from './base.js';
import { env } from '../../config/env.js';

/**
 * Pricing per token (USD) for AskCodi models.
 * Placeholder values — update when official pricing is available.
 */
const PRICING: Record<string, [prompt: number, completion: number]> = {
  'askcodi-default': [1e-6, 2e-6],
};

const DEFAULT_PRICING: [number, number] = [1e-6, 2e-6];

export class AskCodiProvider extends BaseLLMProvider {
  constructor(config?: Partial<LLMProviderConfig>) {
    super({
      name: config?.name ?? 'askcodi',
      baseUrl: config?.baseUrl ?? 'https://api.askcodi.com/v1',
      apiKey: config?.apiKey ?? env.ASKCODI_API_KEY,
      defaultModel: config?.defaultModel ?? 'askcodi-default',
      models: config?.models ?? ['askcodi-default'],
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
