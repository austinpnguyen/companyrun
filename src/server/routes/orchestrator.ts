// ============================================================
// Orchestrator Routes — /api/orchestrator
// ============================================================

import type { FastifyInstance } from 'fastify';
import { orchestrator, decisionEngine } from '../../orchestrator/index.js';
import { wsManager } from '../websocket.js';
import { createLogger } from '../../shared/logger.js';
import { ValidationError } from '../../shared/errors.js';

const log = createLogger('server:routes:orchestrator');

export default async function orchestratorRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/orchestrator/status — orchestrator status ────
  app.get('/orchestrator/status', async (_request, reply) => {
    log.debug('GET /api/orchestrator/status');

    const status = orchestrator.getStatus();

    return reply.send({ status });
  });

  // ── POST /api/orchestrator/command — send command ─────────
  app.post('/orchestrator/command', async (request, reply) => {
    const body = request.body as { command?: string } | null;
    log.debug({ body }, 'POST /api/orchestrator/command');

    if (!body?.command || body.command.trim().length === 0) {
      throw new ValidationError('command is required');
    }

    const result = await orchestrator.processCommand(body.command);

    return reply.send({ result });
  });

  // ── GET /api/orchestrator/decisions — pending decisions ───
  app.get('/orchestrator/decisions', async (_request, reply) => {
    log.debug('GET /api/orchestrator/decisions');

    const decisions = decisionEngine.getPendingDecisions();

    return reply.send({ decisions, total: decisions.length });
  });

  // ── POST /api/orchestrator/decisions/:id/approve ──────────
  app.post('/orchestrator/decisions/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    log.debug({ decisionId: id }, 'POST /api/orchestrator/decisions/:id/approve');

    await decisionEngine.approveDecision(id);

    // Emit WebSocket event
    wsManager.emitDecisionPending({ id, status: 'approved' });

    return reply.send({
      message: `Decision ${id} approved`,
      decisionId: id,
    });
  });

  // ── POST /api/orchestrator/decisions/:id/reject ───────────
  app.post('/orchestrator/decisions/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    log.debug({ decisionId: id }, 'POST /api/orchestrator/decisions/:id/reject');

    await decisionEngine.rejectDecision(id);

    // Emit WebSocket event
    wsManager.emitDecisionPending({ id, status: 'rejected' });

    return reply.send({
      message: `Decision ${id} rejected`,
      decisionId: id,
    });
  });
}
