// ============================================================
// Company Routes — /api/company
// ============================================================

import type { FastifyInstance } from 'fastify';
import { eq, count } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { company, agents, tasks } from '../../db/schema.js';
import { reportService } from '../../economy/index.js';
import { createLogger } from '../../shared/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import { getConfigStatus } from '../../config/setup-check.js';

const log = createLogger('server:routes:company');

// ── LLM provider metadata ────────────────────────────────────
const LLM_PROVIDER_META: Record<string, { displayName: string; envKey: string; endpoint: string; description: string }> = {
  openrouter: {
    displayName: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1',
    description: 'Cloud LLM gateway — access hundreds of models via one API',
  },
  togetherai: {
    displayName: 'Together AI',
    envKey: 'TOGETHERAI_API_KEY',
    endpoint: 'https://api.together.xyz/v1',
    description: 'Cloud inference — fast open-source model hosting',
  },
  askcodi: {
    displayName: 'AskCodi',
    envKey: 'ASKCODI_API_KEY',
    endpoint: 'https://api.askcodi.com/v1',
    description: 'AI coding assistant API',
  },
  '9router': {
    displayName: '9router',
    envKey: 'NINE_ROUTER_API_KEY',
    endpoint: 'http://192.168.0.110:20128/v1',
    description: 'Self-hosted OpenAI-compatible LLM endpoint on LAN',
  },
};

export default async function companyRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/company — company overview ───────────────────
  app.get('/company', async (_request, reply) => {
    log.debug('GET /api/company');

    const [companyRow] = await db.select().from(company).limit(1);
    if (!companyRow) {
      throw new NotFoundError('Company');
    }

    // Agent count
    const [agentCount] = await db
      .select({ value: count() })
      .from(agents)
      .where(eq(agents.status, 'active'));

    // Task stats
    const taskRows = await db
      .select({ status: tasks.status, cnt: count() })
      .from(tasks)
      .groupBy(tasks.status);

    const taskStats: Record<string, number> = {};
    for (const row of taskRows) {
      taskStats[row.status ?? 'unknown'] = row.cnt;
    }

    return reply.send({
      company: companyRow,
      activeAgents: agentCount?.value ?? 0,
      taskStats,
    });
  });

  // ── PUT /api/company/config — update company settings ─────
  app.put('/company/config', async (request, reply) => {
    log.debug('PUT /api/company/config');

    const body = request.body as Record<string, unknown> | null;
    if (!body) {
      throw new ValidationError('Request body is required');
    }

    const [existing] = await db.select().from(company).limit(1);
    if (!existing) {
      throw new NotFoundError('Company');
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updateValues.name = body.name;
    if (body.description !== undefined) updateValues.description = body.description;
    if (body.config !== undefined) updateValues.config = body.config;

    const [updated] = await db
      .update(company)
      .set(updateValues)
      .where(eq(company.id, existing.id))
      .returning();

    return reply.send({ company: updated });
  });

  // ── GET /api/company/providers — LLM provider status ──────
  app.get('/company/providers', async (_request, reply) => {
    log.debug('GET /api/company/providers');

    const configStatus = getConfigStatus();

    const providers = Object.entries(LLM_PROVIDER_META).map(([id, meta]) => {
      const fieldStatus = configStatus.fields[meta.envKey];
      return {
        id,
        displayName: meta.displayName,
        endpoint: meta.endpoint,
        description: meta.description,
        configured: fieldStatus?.set ?? false,
        maskedKey: fieldStatus?.maskedValue ?? '',
      };
    });

    return reply.send({ providers });
  });

  // ── GET /api/company/report — daily financial report ──────
  app.get('/company/report', async (_request, reply) => {
    log.debug('GET /api/company/report');

    const report = await reportService.generateDailyReport();
    const summary = reportService.generateTextSummary(report);

    return reply.send({ report, summary });
  });
}
