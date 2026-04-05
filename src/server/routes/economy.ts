// ============================================================
// Economy Routes — /api/economy
// ============================================================

import type { FastifyInstance } from 'fastify';
import { sql, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { llmUsage } from '../../db/schema.js';
import { economyEngine, walletService } from '../../economy/index.js';
import { wsManager } from '../websocket.js';
import { createLogger } from '../../shared/logger.js';
import { ValidationError } from '../../shared/errors.js';

const log = createLogger('server:routes:economy');

export default async function economyRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/economy/overview — financial overview ────────
  app.get('/economy/overview', async (request, reply) => {
    const query = request.query as { periodDays?: string };
    log.debug('GET /api/economy/overview');

    const periodDays = query.periodDays ? parseInt(query.periodDays, 10) : undefined;
    const overview = await economyEngine.getOverview(periodDays);

    return reply.send({ overview });
  });

  // ── GET /api/economy/transactions — transaction history ───
  app.get('/economy/transactions', async (request, reply) => {
    const query = request.query as {
      agentId?: string;
      type?: string;
      limit?: string;
      offset?: string;
    };
    log.debug({ query }, 'GET /api/economy/transactions');

    if (!query.agentId) {
      throw new ValidationError('agentId query parameter is required');
    }

    const options = {
      type: query.type,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      offset: query.offset ? parseInt(query.offset, 10) : 0,
    };

    const result = await walletService.getTransactions(query.agentId, options);

    return reply.send(result);
  });

  // ── GET /api/economy/leaderboard — top earners ────────────
  app.get('/economy/leaderboard', async (request, reply) => {
    const query = request.query as { limit?: string };
    log.debug('GET /api/economy/leaderboard');

    const limit = query.limit ? parseInt(query.limit, 10) : 10;
    const leaderboard = await economyEngine.getLeaderboard(limit);

    return reply.send({ leaderboard });
  });

  // ── POST /api/economy/budget — adjust budget ──────────────
  app.post('/economy/budget', async (request, reply) => {
    const body = request.body as {
      amount?: number;
      action?: 'add' | 'deduct';
    } | null;
    log.debug({ body }, 'POST /api/economy/budget');

    if (!body?.amount || body.amount <= 0) {
      throw new ValidationError('amount must be a positive number');
    }
    if (!body.action || !['add', 'deduct'].includes(body.action)) {
      throw new ValidationError('action must be "add" or "deduct"');
    }

    let remaining: number;
    if (body.action === 'add') {
      remaining = await economyEngine.addToBudget(body.amount, 'Budget adjustment via API');
    } else {
      remaining = await economyEngine.deductFromBudget(body.amount, 'Budget deduction via API');
    }

    // Emit WebSocket event
    wsManager.emitTransaction({
      type: 'budget_adjustment',
      action: body.action,
      amount: body.amount,
      remaining,
    });

    return reply.send({
      message: `Budget ${body.action === 'add' ? 'increased' : 'decreased'} by ${body.amount}`,
      budgetRemaining: remaining,
    });
  });

  // ── GET /api/economy/health — financial health check ──────
  app.get('/economy/health', async (_request, reply) => {
    log.debug('GET /api/economy/health');

    const health = await economyEngine.healthCheck();

    return reply.send({ health });
  });

  // ── GET /api/economy/token-usage — LLM token usage per agent ──
  app.get('/economy/token-usage', async (request, reply) => {
    const query = request.query as { days?: string };
    const days = query.days ? parseInt(query.days, 10) : 7;
    log.debug({ days }, 'GET /api/economy/token-usage');

    const since = new Date(Date.now() - days * 86_400_000);

    // Aggregate by agentId: total prompt, completion, cost, calls
    const rows = await db
      .select({
        agentId:          llmUsage.agentId,
        provider:         llmUsage.provider,
        model:            llmUsage.model,
        totalPrompt:      sql<number>`SUM(${llmUsage.promptTokens})::int`,
        totalCompletion:  sql<number>`SUM(${llmUsage.completionTokens})::int`,
        totalCostUsd:     sql<number>`SUM(${llmUsage.costUsd}::numeric)`,
        callCount:        sql<number>`COUNT(*)::int`,
        avgLatencyMs:     sql<number>`AVG(${llmUsage.latencyMs})::int`,
      })
      .from(llmUsage)
      .where(sql`${llmUsage.createdAt} >= ${since}`)
      .groupBy(llmUsage.agentId, llmUsage.provider, llmUsage.model)
      .orderBy(desc(sql`SUM(${llmUsage.costUsd}::numeric)`));

    // Also compute totals
    const totals = rows.reduce(
      (acc, r) => ({
        totalPrompt:     acc.totalPrompt     + (r.totalPrompt     ?? 0),
        totalCompletion: acc.totalCompletion + (r.totalCompletion ?? 0),
        totalCostUsd:    acc.totalCostUsd    + (Number(r.totalCostUsd) ?? 0),
        callCount:       acc.callCount       + (r.callCount       ?? 0),
      }),
      { totalPrompt: 0, totalCompletion: 0, totalCostUsd: 0, callCount: 0 },
    );

    return reply.send({ rows, totals, periodDays: days });
  });
}
