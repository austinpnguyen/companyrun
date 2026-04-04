// ============================================================
// Skills Routes — /api/skills
// ============================================================

import type { FastifyInstance } from 'fastify';
import { mcpManager, mcpRegistry } from '../../mcp/index.js';
import { createLogger } from '../../shared/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

const log = createLogger('server:routes:skills');

export default async function skillRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/skills — skill catalog ───────────────────────
  app.get('/skills', async (_request, reply) => {
    log.debug('GET /api/skills');

    const catalog = await mcpManager.getSkillCatalog();

    return reply.send({ skills: catalog, total: catalog.length });
  });

  // ── POST /api/skills — register new skill ─────────────────
  app.post('/skills', async (request, reply) => {
    const body = request.body as {
      name?: string;
      description?: string;
      serverCommand?: string;
      serverArgs?: string[];
      serverEnv?: Record<string, string>;
      category?: string;
      difficulty?: number;
    } | null;
    log.debug({ body }, 'POST /api/skills');

    if (!body?.name) {
      throw new ValidationError('Skill name is required');
    }
    if (!body.serverCommand) {
      throw new ValidationError('serverCommand is required');
    }

    const skill = await mcpManager.registerSkill({
      name: body.name,
      description: body.description ?? '',
      serverCommand: body.serverCommand,
      serverArgs: body.serverArgs ?? [],
      serverEnv: body.serverEnv,
      category: body.category ?? 'general',
      difficulty: body.difficulty ?? 1,
    });

    return reply.status(201).send({ skill });
  });

  // ── GET /api/skills/:id — skill detail ────────────────────
  app.get('/skills/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    log.debug({ skillId: id }, 'GET /api/skills/:id');

    const skill = await mcpRegistry.getSkill(id);
    if (!skill) {
      throw new NotFoundError('Skill', id);
    }

    return reply.send({ skill });
  });

  // ── PUT /api/skills/:id — update skill config ────────────
  app.put('/skills/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> | null;
    log.debug({ skillId: id }, 'PUT /api/skills/:id');

    if (!body) {
      throw new ValidationError('Request body is required');
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.serverCommand !== undefined) updates.serverCommand = body.serverCommand;
    if (body.serverArgs !== undefined) updates.serverArgs = body.serverArgs;
    if (body.serverEnv !== undefined) updates.serverEnv = body.serverEnv;
    if (body.category !== undefined) updates.category = body.category;
    if (body.difficulty !== undefined) updates.difficulty = body.difficulty;

    const updated = await mcpRegistry.updateSkill(id, updates as Parameters<typeof mcpRegistry.updateSkill>[1]);

    return reply.send({ skill: updated });
  });
}
