import { db } from '../config/database.js';
import { llmUsage } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import { sql, eq, gte, and } from 'drizzle-orm';

const log = createLogger('llm:tracker');

// ============================================================
// Types
// ============================================================

export interface TrackUsageParams {
  provider: string;
  model: string;
  agentId?: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
}

export interface UsageStats {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
}

// ============================================================
// LLMUsageTracker
// ============================================================

export class LLMUsageTracker {
  // ----------------------------------------------------------
  // Log a completed request
  // ----------------------------------------------------------

  async trackUsage(params: TrackUsageParams): Promise<void> {
    try {
      await db.insert(llmUsage).values({
        provider: params.provider,
        model: params.model,
        agentId: params.agentId ?? null,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        costUsd: params.costUsd.toFixed(6),
        latencyMs: params.latencyMs,
      });

      log.debug(
        {
          provider: params.provider,
          model: params.model,
          tokens: params.promptTokens + params.completionTokens,
          costUsd: params.costUsd.toFixed(6),
        },
        'Usage tracked',
      );
    } catch (error) {
      log.error({ error, params }, 'Failed to track LLM usage');
    }
  }

  // ----------------------------------------------------------
  // Query usage by agent
  // ----------------------------------------------------------

  async getUsageByAgent(agentId: string, since?: Date): Promise<UsageStats> {
    const conditions = since
      ? and(eq(llmUsage.agentId, agentId), gte(llmUsage.createdAt, since))
      : eq(llmUsage.agentId, agentId);

    return this.aggregate(conditions);
  }

  // ----------------------------------------------------------
  // Query usage by provider
  // ----------------------------------------------------------

  async getUsageByProvider(provider: string, since?: Date): Promise<UsageStats> {
    const conditions = since
      ? and(eq(llmUsage.provider, provider), gte(llmUsage.createdAt, since))
      : eq(llmUsage.provider, provider);

    return this.aggregate(conditions);
  }

  // ----------------------------------------------------------
  // Total cost across all providers
  // ----------------------------------------------------------

  async getTotalCost(since?: Date): Promise<number> {
    const conditions = since ? gte(llmUsage.createdAt, since) : undefined;

    const [result] = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(${llmUsage.costUsd}), 0)`,
      })
      .from(llmUsage)
      .where(conditions);

    return parseFloat(result?.totalCost ?? '0');
  }

  // ----------------------------------------------------------
  // Internal aggregation helper
  // ----------------------------------------------------------

  private async aggregate(
    conditions: ReturnType<typeof eq> | ReturnType<typeof and> | undefined,
  ): Promise<UsageStats> {
    const [result] = await db
      .select({
        totalRequests: sql<string>`COUNT(*)`,
        totalPromptTokens: sql<string>`COALESCE(SUM(${llmUsage.promptTokens}), 0)`,
        totalCompletionTokens: sql<string>`COALESCE(SUM(${llmUsage.completionTokens}), 0)`,
        totalCostUsd: sql<string>`COALESCE(SUM(${llmUsage.costUsd}), 0)`,
        avgLatencyMs: sql<string>`COALESCE(AVG(${llmUsage.latencyMs}), 0)`,
      })
      .from(llmUsage)
      .where(conditions);

    const totalPromptTokens = parseInt(result?.totalPromptTokens ?? '0', 10);
    const totalCompletionTokens = parseInt(result?.totalCompletionTokens ?? '0', 10);

    return {
      totalRequests: parseInt(result?.totalRequests ?? '0', 10),
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens: totalPromptTokens + totalCompletionTokens,
      totalCostUsd: parseFloat(result?.totalCostUsd ?? '0'),
      avgLatencyMs: Math.round(parseFloat(result?.avgLatencyMs ?? '0')),
    };
  }
}

// ============================================================
// Singleton instance
// ============================================================

export const llmUsageTracker = new LLMUsageTracker();
