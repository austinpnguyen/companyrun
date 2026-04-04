/**
 * Lightweight Setup Server — runs when the app is NOT yet configured.
 *
 * This minimal Fastify server:
 *  - Does NOT require a database connection
 *  - Serves the frontend static files from frontend/dist/
 *  - Provides setup API routes for the web-based configuration wizard
 *  - Listens on the same PORT (default 3000)
 */
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from '../shared/logger.js';
import setupRoutes from './routes/setup.js';

const log = createLogger('setup-server');

/**
 * Build and start the setup-mode Fastify server.
 * Returns the server instance (already listening).
 */
export async function startSetupServer(): Promise<void> {
  const port = parseInt(process.env.PORT || '3000', 10);

  const app = Fastify({
    logger: {
      level: 'info',
    },
  });

  // ── CORS (open in setup mode — local network access) ──────
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // ── Setup API routes ──────────────────────────────────────
  await app.register(setupRoutes, { prefix: '/api' });

  // ── Health check (setup mode) ─────────────────────────────
  app.get('/api/health', async (_request, reply) => {
    return reply.send({
      status: 'setup',
      message: 'CompanyRun is running in setup mode. Visit the UI to configure.',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Serve frontend static files ───────────────────────────
  const frontendDistPath = join(process.cwd(), 'frontend', 'dist');

  if (existsSync(frontendDistPath)) {
    await app.register(fastifyStatic, {
      root: frontendDistPath,
      prefix: '/',
      wildcard: false,
    });

    // SPA fallback: serve index.html for any non-API, non-file route
    app.setNotFoundHandler(async (request, reply) => {
      // Don't intercept API calls
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Route ${request.method} ${request.url} not found`,
          statusCode: 404,
        });
      }

      // Serve index.html for SPA client-side routing
      return reply.sendFile('index.html');
    });

    log.info({ path: frontendDistPath }, 'Serving frontend static files');
  } else {
    log.warn(
      { path: frontendDistPath },
      'Frontend dist directory not found — setup API is available but no UI will be served',
    );

    // Fallback: return a simple HTML page directing users to the API
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Route ${request.method} ${request.url} not found`,
          statusCode: 404,
        });
      }

      return reply.type('text/html').send(FALLBACK_HTML);
    });
  }

  // ── Start listening ───────────────────────────────────────
  try {
    await app.listen({ port, host: '0.0.0.0' });
    log.info(`🔧 Setup server listening on http://0.0.0.0:${port}`);
    log.info(`🔧 Visit http://localhost:${port} to configure CompanyRun`);
  } catch (err) {
    log.fatal(err, '❌ Failed to start setup server');
    process.exit(1);
  }

  // ── Graceful shutdown ─────────────────────────────────────
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal} — shutting down setup server...`);
    try {
      await app.close();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// ── Fallback HTML when frontend is not built ─────────────────

const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CompanyRun — Setup</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 600px;
      text-align: center;
    }
    h1 { font-size: 2rem; margin-bottom: 1rem; color: #38bdf8; }
    p { line-height: 1.6; margin-bottom: 1rem; color: #94a3b8; }
    code {
      background: #1e293b;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.9rem;
      color: #38bdf8;
    }
    .status { margin-top: 2rem; padding: 1rem; background: #1e293b; border-radius: 8px; }
    .status h2 { font-size: 1rem; color: #f59e0b; margin-bottom: 0.5rem; }
    a { color: #38bdf8; }
    .endpoint { text-align: left; margin: 0.25rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔧 CompanyRun Setup Mode</h1>
    <p>
      The frontend has not been built yet. To use the setup wizard UI, run:
    </p>
    <p><code>cd frontend && npm install && npm run build</code></p>
    <p>Then restart the server.</p>
    <div class="status">
      <h2>📡 Setup API Available</h2>
      <p>You can configure CompanyRun via the API directly:</p>
      <div class="endpoint"><code>GET</code>  <a href="/api/setup/status">/api/setup/status</a> — Check configuration</div>
      <div class="endpoint"><code>POST</code> /api/setup/save — Save .env values</div>
      <div class="endpoint"><code>POST</code> /api/setup/test-database — Test DB connection</div>
      <div class="endpoint"><code>POST</code> /api/setup/test-llm — Test LLM API key</div>
      <div class="endpoint"><code>POST</code> /api/setup/initialize — Push schema &amp; seed</div>
      <div class="endpoint"><code>POST</code> /api/setup/restart — Restart server</div>
    </div>
  </div>
</body>
</html>`;
