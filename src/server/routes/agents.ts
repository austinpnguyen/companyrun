// ============================================================
// Agent Routes — /api/agents
// ============================================================

import type { FastifyInstance } from 'fastify';
import { agentManager } from '../../agents/index.js';
import { mcpManager } from '../../mcp/index.js';
import { performanceReviewer } from '../../kpi/index.js';
import { walletService } from '../../economy/index.js';
import { wsManager } from '../websocket.js';
import { createLogger } from '../../shared/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

const log = createLogger('server:routes:agents');

export default async function agentRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/agents — list all agents ─────────────────────
  app.get('/agents', async (request, reply) => {
    const query = request.query as { status?: string };
    log.debug({ status: query.status }, 'GET /api/agents');

    const filter = query.status ? { status: query.status } : undefined;
    const agentList = await agentManager.listAgents(filter);

    return reply.send({ agents: agentList, total: agentList.length });
  });

  // ── GET /api/agents/:id — agent detail ────────────────────
  app.get('/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    log.debug({ agentId: id }, 'GET /api/agents/:id');

    const agent = await agentManager.getAgent(id);
    if (!agent) {
      throw new NotFoundError('Agent', id);
    }

    return reply.send({ agent });
  });

  // ── POST /api/agents/hire — hire from template ────────────
  app.post('/agents/hire', async (request, reply) => {
    const body = request.body as { templateRole?: string; name?: string } | null;
    log.debug({ body }, 'POST /api/agents/hire');

    if (!body?.name) {
      throw new ValidationError('Agent name is required');
    }

    const result = await agentManager.hire({
      templateRole: body.templateRole,
      name: body.name,
    });

    // Emit WebSocket event
    wsManager.emitAgentStatus(result.agentId, 'active');

    return reply.status(201).send({
      message: `Agent "${body.name}" hired successfully`,
      agentId: result.agentId,
      agent: result.agent,
    });
  });

  // ── POST /api/agents/:id/fire — fire an agent ────────────
  app.post('/agents/:id/fire', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: string } | null;
    log.debug({ agentId: id, reason: body?.reason }, 'POST /api/agents/:id/fire');

    const reason = body?.reason ?? 'Terminated by user';
    await agentManager.fire(id, reason);

    // Emit WebSocket event
    wsManager.emitAgentStatus(id, 'fired');

    return reply.send({
      message: `Agent ${id} has been fired`,
      reason,
    });
  });

  // ── PUT /api/agents/:id — update agent config ────────────
  app.put('/agents/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> | null;
    log.debug({ agentId: id }, 'PUT /api/agents/:id');

    if (!body) {
      throw new ValidationError('Request body is required');
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
    if (body.model !== undefined) updates.model = body.model;
    if (body.provider !== undefined) updates.provider = body.provider;
    if (body.personality !== undefined) updates.personality = body.personality;

    const updated = await agentManager.updateAgent(id, updates as Parameters<typeof agentManager.updateAgent>[1]);

    return reply.send({ agent: updated });
  });

  // ── POST /api/agents/:id/skills — assign skill ────────────
  app.post('/agents/:id/skills', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { skillNameOrId?: string } | null;
    log.debug({ agentId: id, body }, 'POST /api/agents/:id/skills');

    if (!body?.skillNameOrId) {
      throw new ValidationError('skillNameOrId is required');
    }

    await mcpManager.learnSkill(id, body.skillNameOrId);

    return reply.status(201).send({
      message: `Skill "${body.skillNameOrId}" assigned to agent ${id}`,
    });
  });

  // ── DELETE /api/agents/:id/skills/:skillId — remove skill ─
  app.delete('/agents/:id/skills/:skillId', async (request, reply) => {
    const { id, skillId } = request.params as { id: string; skillId: string };
    log.debug({ agentId: id, skillId }, 'DELETE /api/agents/:id/skills/:skillId');

    await mcpManager.forgetSkill(id, skillId);

    return reply.send({
      message: `Skill ${skillId} removed from agent ${id}`,
    });
  });

  // ── GET /api/agents/:id/kpi — agent KPI history ──────────
  app.get('/agents/:id/kpi', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string };
    log.debug({ agentId: id }, 'GET /api/agents/:id/kpi');

    const agent = await agentManager.getAgent(id);
    if (!agent) {
      throw new NotFoundError('Agent', id);
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const reviews = await performanceReviewer.getReviewHistory(id, limit);

    return reply.send({ agentId: id, reviews });
  });

  // ── GET /api/agents/:id/wallet — agent wallet + txns ─────
  app.get('/agents/:id/wallet', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; type?: string };
    log.debug({ agentId: id }, 'GET /api/agents/:id/wallet');

    const agent = await agentManager.getAgent(id);
    if (!agent) {
      throw new NotFoundError('Agent', id);
    }

    const wallet = await walletService.getWallet(id);
    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const txns = await walletService.getTransactions(id, { limit, type: query.type });

    return reply.send({
      agentId: id,
      wallet,
      transactions: txns,
    });
  });
}
