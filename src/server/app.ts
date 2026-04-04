import path from 'path';
import { existsSync, readFileSync } from 'fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { env } from '../config/env.js';
import { createLogger } from '../shared/logger.js';
import { isOperationalError } from '../shared/errors.js';
import type { HealthCheckResponse, ApiErrorResponse } from '../shared/types.js';

// Route modules
import companyRoutes from './routes/company.js';
import agentRoutes from './routes/agents.js';
import taskRoutes from './routes/tasks.js';
import economyRoutes from './routes/economy.js';
import orchestratorRoutes from './routes/orchestrator.js';
import skillRoutes from './routes/skills.js';
import chatRoutes from './routes/chat.js';

const log = createLogger('server');

/**
 * Build and configure the Fastify application instance.
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
    // Disable default request id header in production
    requestIdHeader: env.NODE_ENV === 'production' ? false : 'x-request-id',
  });

  // ── CORS ──────────────────────────────────────────────────
  // ALLOWED_ORIGINS = comma-separated list, e.g. "http://192.168.0.100,https://myapp.com"
  // Supports separated deployments where the frontend is served from a different origin.
  // In dev with no env var set: allow all origins (Vite proxy handles it anyway).
  // In production with no env var set: same-origin only (frontend served by Fastify itself).
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : null;

  await app.register(cors, {
    origin: allowedOrigins ?? (env.NODE_ENV === 'production' ? false : true),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // ── Global error handler ──────────────────────────────────
  app.setErrorHandler((error, _request, reply) => {
    if (isOperationalError(error)) {
      const body: ApiErrorResponse = {
        error: error.name,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
      };
      return reply.status(error.statusCode).send(body);
    }

    // Unexpected errors
    log.error(error, 'Unhandled error');
    const errMessage = error instanceof Error ? error.message : String(error);
    const body: ApiErrorResponse = {
      error: 'InternalServerError',
      message:
        env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : errMessage,
      statusCode: 500,
    };
    return reply.status(500).send(body);
  });

  // ── Health check ──────────────────────────────────────────
  app.get('/api/health', async (_request, reply) => {
    const response: HealthCheckResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      uptime: process.uptime(),
    };
    return reply.send(response);
  });

  // ── Register route modules ────────────────────────────────
  await app.register(companyRoutes, { prefix: '/api' });
  await app.register(agentRoutes, { prefix: '/api' });
  await app.register(taskRoutes, { prefix: '/api' });
  await app.register(economyRoutes, { prefix: '/api' });
  await app.register(orchestratorRoutes, { prefix: '/api' });
  await app.register(skillRoutes, { prefix: '/api' });
  await app.register(chatRoutes, { prefix: '/api' });

  log.info('All API routes registered');

  // ── Static file serving (frontend) ─────────────────────────
  const distPath = path.join(process.cwd(), 'frontend', 'dist');
  if (existsSync(distPath)) {
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
      decorateReply: false, // avoid conflict if already registered
    });

    // SPA fallback – serve index.html for non-API routes
    const indexHtml = readFileSync(path.join(distPath, 'index.html'), 'utf-8');
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        reply.status(404).send({ error: 'Not found' });
      } else {
        reply.type('text/html').send(indexHtml);
      }
    });

    log.info('Serving frontend from %s', distPath);
  }

  return app;
}
