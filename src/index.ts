/**
 * CompanyRun — Entry point
 *
 * Smart boot logic:
 *  1. Check if .env is properly configured (real values, not placeholders)
 *  2. If NOT configured → start lightweight setup server (web wizard)
 *  3. If configured → start the full application (existing behavior)
 */
import { createLogger } from './shared/logger.js';
import { checkIfConfigured } from './config/setup-check.js';

const log = createLogger('main');

async function main() {
  // ── Step 1: Check configuration ────────────────────────────
  const isConfigured = checkIfConfigured();

  if (!isConfigured) {
    // ── SETUP MODE ─────────────────────────────────────────
    log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log.info('🔧 Starting in SETUP MODE');
    log.info('   .env is missing or has placeholder values');
    log.info('   Visit http://localhost:3000 to configure');
    log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const { startSetupServer } = await import('./server/setup-app.js');
    await startSetupServer();
    return;
  }

  // ── NORMAL MODE ──────────────────────────────────────────
  // Import heavy modules only when we're actually configured.
  // This avoids the Zod env validation crash in setup mode.
  const { env } = await import('./config/env.js');
  const { db, closeDatabase } = await import('./config/database.js');
  const { buildApp } = await import('./server/app.js');
  const { wsManager } = await import('./server/websocket.js');
  const { mcpManager } = await import('./mcp/index.js');
  const { agentManager } = await import('./agents/index.js');
  const { taskQueue } = await import('./tasks/index.js');
  const { orchestrator } = await import('./orchestrator/index.js');
  const { llmGateway } = await import('./llm/gateway.js');
  const { OpenRouterProvider } = await import('./llm/providers/openrouter.js');
  const { TogetherAIProvider } = await import('./llm/providers/togetherai.js');
  const { AskCodiProvider } = await import('./llm/providers/askcodi.js');
  const { NineRouterProvider } = await import('./llm/providers/9router.js');

  log.info('🚀 Starting CompanyRun...');
  log.info({ env: env.NODE_ENV, port: env.PORT }, 'Configuration loaded');

  // ── 0. Register LLM providers with the gateway ─────────────
  try {
    llmGateway.registerProvider(new OpenRouterProvider());
    if (env.TOGETHERAI_API_KEY) {
      llmGateway.registerProvider(new TogetherAIProvider());
    }
    if (env.ASKCODI_API_KEY) {
      llmGateway.registerProvider(new AskCodiProvider());
    }
    if (env.NINE_ROUTER_API_KEY) {
      llmGateway.registerProvider(new NineRouterProvider());
    }
    log.info('✅ LLM providers registered');
  } catch (err) {
    log.error(err, '⚠️ LLM provider registration failed (non-fatal)');
  }

  // ── 1. Verify database connection ─────────────────────────
  try {
    await db.execute(/* sql */ `SELECT 1`);
    log.info('✅ Database connected');
  } catch (err) {
    log.fatal(err, '❌ Failed to connect to database');
    process.exit(1);
  }

  // ── 2. Initialize MCP manager (skill system) ──────────────
  try {
    await mcpManager.initialize();
    log.info('✅ MCP manager initialized');
  } catch (err) {
    log.error(err, '⚠️ MCP manager initialization failed (non-fatal)');
  }

  // ── 3. Activate all agents ────────────────────────────────
  try {
    await agentManager.activateAll();
    log.info('✅ Agent runtimes activated');
  } catch (err) {
    log.error(err, '⚠️ Agent activation failed (non-fatal)');
  }

  // ── 4. Load task queue from DB ────────────────────────────
  try {
    await taskQueue.loadFromDatabase();
    log.info('✅ Task queue loaded from database');
  } catch (err) {
    log.error(err, '⚠️ Task queue load failed (non-fatal)');
  }

  // ── 5. Build & start Fastify ──────────────────────────────
  const app = await buildApp();

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    log.info(`✅ Server listening on http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    log.fatal(err, '❌ Failed to start server');
    process.exit(1);
  }

  // ── 6. Initialize WebSocket on the running server ─────────
  try {
    // Fastify's underlying HTTP server is available after listen()
    const httpServer = app.server;
    wsManager.initialize(httpServer);
    log.info('✅ WebSocket manager initialized');
  } catch (err) {
    log.error(err, '⚠️ WebSocket initialization failed (non-fatal)');
  }

  // ── 7. Start orchestrator daemon ──────────────────────────
  try {
    await orchestrator.start();
    log.info('✅ Orchestrator daemon started');
  } catch (err) {
    log.error(err, '⚠️ Orchestrator start failed (non-fatal)');
  }

  log.info('🏢 CompanyRun is running — your AI company is open for business!');

  // ── Graceful shutdown ─────────────────────────────────────
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal} — shutting down gracefully...`);

    // 1. Stop orchestrator daemon
    try {
      await orchestrator.stop();
      log.info('Orchestrator stopped');
    } catch (err) {
      log.error(err, 'Error stopping orchestrator');
    }

    // 2. Shutdown all agent runtimes
    try {
      await agentManager.shutdownAll();
      log.info('Agent runtimes shut down');
    } catch (err) {
      log.error(err, 'Error shutting down agents');
    }

    // 3. Disconnect all MCP connections
    try {
      await mcpManager.shutdownAll();
      log.info('MCP connections closed');
    } catch (err) {
      log.error(err, 'Error shutting down MCP');
    }

    // 4. Close WebSocket server
    try {
      await wsManager.close();
      log.info('WebSocket server closed');
    } catch (err) {
      log.error(err, 'Error closing WebSocket');
    }

    // 5. Close Fastify server
    try {
      await app.close();
      log.info('Fastify server closed');
    } catch (err) {
      log.error(err, 'Error closing Fastify');
    }

    // 6. Close database connection
    try {
      await closeDatabase();
      log.info('Database connection closed');
    } catch (err) {
      log.error(err, 'Error closing database');
    }

    log.info('👋 CompanyRun shut down cleanly');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
