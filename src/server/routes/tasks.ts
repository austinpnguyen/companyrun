// ============================================================
// Task Routes — /api/tasks
// ============================================================

import type { FastifyInstance } from 'fastify';
import { taskManager, taskReviewer } from '../../tasks/index.js';
import { wsManager } from '../websocket.js';
import { createLogger } from '../../shared/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';
import type { TaskPriority } from '../../shared/types.js';

const log = createLogger('server:routes:tasks');

export default async function taskRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /api/tasks/stats — task stats by status ───────────
  // NOTE: Registered BEFORE /api/tasks/:id so Fastify doesn't
  //       interpret "stats" as an :id parameter.
  app.get('/tasks/stats', async (_request, reply) => {
    log.debug('GET /api/tasks/stats');

    const stats = await taskManager.getStats();

    return reply.send({ stats });
  });

  // ── GET /api/tasks — list tasks ───────────────────────────
  app.get('/tasks', async (request, reply) => {
    const query = request.query as {
      status?: string;
      priority?: string;
      assignedAgentId?: string;
      limit?: string;
      offset?: string;
    };
    log.debug({ query }, 'GET /api/tasks');

    const filters: Parameters<typeof taskManager.list>[0] = {};
    if (query.status) filters.status = query.status;
    if (query.priority) filters.priority = query.priority;
    if (query.assignedAgentId) filters.assignedAgentId = query.assignedAgentId;
    if (query.limit) filters.limit = parseInt(query.limit, 10);
    if (query.offset) filters.offset = parseInt(query.offset, 10);

    const result = await taskManager.list(filters);

    return reply.send(result);
  });

  // ── POST /api/tasks — create task ─────────────────────────
  app.post('/tasks', async (request, reply) => {
    const body = request.body as {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      complexity?: number;
      requiredSkills?: string[];
    } | null;
    log.debug({ body }, 'POST /api/tasks');

    if (!body?.title) {
      throw new ValidationError('Task title is required');
    }

    const task = await taskManager.create({
      title: body.title,
      description: body.description,
      priority: body.priority,
      complexity: body.complexity,
      requiredSkills: body.requiredSkills,
      createdBy: 'user',
    });

    // Emit WebSocket event
    wsManager.emitTaskUpdate(task.id, task.status ?? 'created');

    return reply.status(201).send({ task });
  });

  // ── GET /api/tasks/:id — task detail ──────────────────────
  app.get('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    log.debug({ taskId: id }, 'GET /api/tasks/:id');

    const task = await taskManager.getById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    return reply.send({ task });
  });

  // ── PUT /api/tasks/:id — update task ──────────────────────
  app.put('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown> | null;
    log.debug({ taskId: id }, 'PUT /api/tasks/:id');

    if (!body) {
      throw new ValidationError('Request body is required');
    }

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.complexity !== undefined) updates.complexity = body.complexity;
    if (body.requiredSkills !== undefined) updates.requiredSkills = body.requiredSkills;
    if (body.status !== undefined) updates.status = body.status;
    if (body.deadline !== undefined) updates.deadline = body.deadline ? new Date(body.deadline as string) : undefined;

    const updated = await taskManager.update(id, updates as Parameters<typeof taskManager.update>[1]);

    // Emit WebSocket event
    wsManager.emitTaskUpdate(updated.id, updated.status ?? 'unknown');

    return reply.send({ task: updated });
  });

  // ── DELETE /api/tasks/:id — delete task ───────────────────
  app.delete('/tasks/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    log.debug({ taskId: id }, 'DELETE /api/tasks/:id');

    await taskManager.delete(id);

    return reply.send({ message: `Task ${id} deleted` });
  });

  // ── POST /api/tasks/:id/assign — assign to agent ─────────
  app.post('/tasks/:id/assign', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { agentId?: string } | null;
    log.debug({ taskId: id, body }, 'POST /api/tasks/:id/assign');

    if (!body?.agentId) {
      throw new ValidationError('agentId is required');
    }

    const task = await taskManager.assign(id, body.agentId);

    // Emit WebSocket event
    wsManager.emitTaskUpdate(task.id, task.status ?? 'assigned', { agentId: body.agentId });

    return reply.send({ task });
  });

  // ── POST /api/tasks/:id/review — submit manual review ────
  app.post('/tasks/:id/review', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { score?: number; feedback?: string } | null;
    log.debug({ taskId: id, body }, 'POST /api/tasks/:id/review');

    if (body?.score === undefined) {
      throw new ValidationError('score is required (1-5)');
    }
    if (!body?.feedback) {
      throw new ValidationError('feedback is required');
    }

    const review = await taskReviewer.manualReview(id, body.score, body.feedback);

    // Emit WebSocket event
    wsManager.emitTaskUpdate(id, review.approved ? 'review_approved' : 'review_rejected', review);

    return reply.send({ review });
  });
}
