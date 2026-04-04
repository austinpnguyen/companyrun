/**
 * Setup API routes — available ONLY when the app runs in setup mode.
 *
 * Provides endpoints for the web-based setup wizard to:
 *  - Check configuration status
 *  - Save .env values
 *  - Test database connectivity
 *  - Test LLM provider API keys
 *  - Initialize the database (push schema + seed)
 *  - Trigger a graceful restart
 */
import type { FastifyInstance } from 'fastify';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { parse as parseDotenv } from 'dotenv';
import postgres from 'postgres';
import { createLogger } from '../../shared/logger.js';
import { getConfigStatus, maskValue } from '../../config/setup-check.js';

const log = createLogger('setup');

const ENV_PATH = join(process.cwd(), '.env');
const ENV_EXAMPLE_PATH = join(process.cwd(), '.env.example');

// ── LLM provider base URLs ──────────────────────────────────

const LLM_PROVIDERS: Record<string, { baseUrl: string; modelsEndpoint: string }> = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: '/models',
  },
  togetherai: {
    baseUrl: 'https://api.together.xyz/v1',
    modelsEndpoint: '/models',
  },
  askcodi: {
    baseUrl: 'https://api.askcodi.com/v1',
    modelsEndpoint: '/models',
  },
  '9router': {
    baseUrl: 'http://192.168.0.110:20128/v1',
    modelsEndpoint: '/models',
  },
};

// ── Helpers ──────────────────────────────────────────────────

/**
 * Read the current .env file contents as raw text.
 * Falls back to .env.example or empty string.
 */
function readEnvRaw(): string {
  if (existsSync(ENV_PATH)) {
    return readFileSync(ENV_PATH, 'utf-8');
  }
  if (existsSync(ENV_EXAMPLE_PATH)) {
    return readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
  }
  return '';
}

/**
 * Merge new key-value pairs into an existing .env file,
 * preserving comments and ordering. If a key already exists
 * its line is updated in-place; new keys are appended.
 */
function mergeEnvValues(
  existingContent: string,
  updates: Record<string, string>,
): string {
  const lines = existingContent.split('\n');
  const remaining = { ...updates };

  // Update existing lines in-place
  const updatedLines = lines.map((line) => {
    // Skip comments and blank lines
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') return line;

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return line;

    const key = line.slice(0, eqIndex).trim();
    if (key in remaining) {
      const newValue = remaining[key];
      delete remaining[key];
      return `${key}=${newValue}`;
    }
    return line;
  });

  // Append any new keys that weren't already in the file
  for (const [key, value] of Object.entries(remaining)) {
    updatedLines.push(`${key}=${value}`);
  }

  return updatedLines.join('\n');
}

// ── Route registration ───────────────────────────────────────

export default async function setupRoutes(app: FastifyInstance): Promise<void> {
  // ────────────────────────────────────────────────────────────
  // GET /api/setup/status
  // ────────────────────────────────────────────────────────────
  app.get('/setup/status', async (_request, reply) => {
    try {
      const status = getConfigStatus();
      return reply.send(status);
    } catch (err) {
      log.error(err, 'Failed to read config status');
      return reply.status(500).send({
        error: 'Failed to read configuration',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ────────────────────────────────────────────────────────────
  // POST /api/setup/save
  // ────────────────────────────────────────────────────────────
  app.post<{ Body: Record<string, string> }>('/setup/save', async (request, reply) => {
    try {
      const updates = request.body;

      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Request body must be a non-empty JSON object of key-value pairs',
        });
      }

      // Validate all values are strings
      for (const [key, value] of Object.entries(updates)) {
        if (typeof value !== 'string') {
          return reply.status(400).send({
            success: false,
            message: `Value for "${key}" must be a string`,
          });
        }
      }

      const existingContent = readEnvRaw();
      const newContent = mergeEnvValues(existingContent, updates);
      writeFileSync(ENV_PATH, newContent, 'utf-8');

      log.info(
        { keys: Object.keys(updates).map((k) => maskValue(k)) },
        'Configuration saved',
      );

      // Return updated status
      const status = getConfigStatus();
      return reply.send({
        success: true,
        message: 'Configuration saved',
        status,
      });
    } catch (err) {
      log.error(err, 'Failed to save configuration');
      return reply.status(500).send({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ────────────────────────────────────────────────────────────
  // POST /api/setup/test-database
  // ────────────────────────────────────────────────────────────
  app.post<{ Body: { databaseUrl: string } }>(
    '/setup/test-database',
    async (request, reply) => {
      const { databaseUrl } = request.body ?? {};

      if (!databaseUrl || typeof databaseUrl !== 'string') {
        return reply.status(400).send({
          success: false,
          message: 'databaseUrl is required',
        });
      }

      let sql: ReturnType<typeof postgres> | undefined;

      try {
        sql = postgres(databaseUrl, {
          max: 1,
          connect_timeout: 10,
          idle_timeout: 5,
        });

        // Simple connectivity test
        await sql`SELECT 1 AS ok`;

        return reply.send({
          success: true,
          message: 'Database connection successful!',
        });
      } catch (err: unknown) {
        // postgres.js errors have varied shapes — extract the best message
        let message = 'Unknown error';
        if (err instanceof Error) {
          message = err.message || String(err);
          // postgres.js may nest the real cause
          if (!message && 'cause' in err && err.cause) {
            message = String(err.cause);
          }
        } else if (typeof err === 'object' && err !== null) {
          message = JSON.stringify(err);
        } else {
          message = String(err);
        }
        log.warn({ err: message }, 'Database connection test failed');
        return reply.send({
          success: false,
          message: `Connection failed: ${message}`,
        });
      } finally {
        if (sql) {
          try {
            await sql.end();
          } catch {
            // ignore cleanup errors
          }
        }
      }
    },
  );

  // ────────────────────────────────────────────────────────────
  // POST /api/setup/test-llm
  // ────────────────────────────────────────────────────────────
  app.post<{ Body: { provider: string; apiKey: string } }>(
    '/setup/test-llm',
    async (request, reply) => {
      const { provider, apiKey } = request.body ?? {};

      if (!provider || typeof provider !== 'string') {
        return reply.status(400).send({
          success: false,
          message: 'provider is required (openrouter, togetherai, askcodi, 9router)',
        });
      }

      if (!apiKey || typeof apiKey !== 'string') {
        return reply.status(400).send({
          success: false,
          message: 'apiKey is required',
        });
      }

      const providerConfig = LLM_PROVIDERS[provider.toLowerCase()];
      if (!providerConfig) {
        return reply.status(400).send({
          success: false,
          message: `Unknown provider "${provider}". Supported: ${Object.keys(LLM_PROVIDERS).join(', ')}`,
        });
      }

      try {
        // Try listing models — a lightweight API call that verifies the key
        const url = `${providerConfig.baseUrl}${providerConfig.modelsEndpoint}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const headers: Record<string, string> = {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        };

        // OpenRouter requires extra headers
        if (provider.toLowerCase() === 'openrouter') {
          headers['HTTP-Referer'] = 'https://companyrun.local';
          headers['X-Title'] = 'CompanyRun';
        }

        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return reply.send({
            success: true,
            message: `${provider} API key is valid!`,
          });
        }

        const errorText = await response.text().catch(() => 'Unknown error');
        return reply.send({
          success: false,
          message: `${provider} returned ${response.status}: ${errorText.slice(0, 200)}`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        log.warn({ provider, err: message }, 'LLM API test failed');
        return reply.send({
          success: false,
          message: `Failed to reach ${provider}: ${message}`,
        });
      }
    },
  );

  // ────────────────────────────────────────────────────────────
  // POST /api/setup/initialize
  // ────────────────────────────────────────────────────────────
  app.post('/setup/initialize', async (_request, reply) => {
    try {
      // Re-read .env to pick up saved values
      const envContent = existsSync(ENV_PATH)
        ? readFileSync(ENV_PATH, 'utf-8')
        : '';
      const envValues = parseDotenv(Buffer.from(envContent));
      const databaseUrl = envValues.DATABASE_URL;

      if (!databaseUrl) {
        return reply.status(400).send({
          success: false,
          message: 'DATABASE_URL is not set in .env. Save configuration first.',
        });
      }

      log.info('Running database migration (drizzle-kit push)...');

      // Step 1: Push schema using drizzle-kit
      try {
        execSync('npx drizzle-kit push', {
          cwd: process.cwd(),
          env: { ...process.env, ...envValues },
          stdio: 'pipe',
          timeout: 60_000,
        });
        log.info('✅ Database schema pushed');
      } catch (err) {
        const stderr =
          err instanceof Error && 'stderr' in err
            ? String((err as NodeJS.ErrnoException & { stderr: unknown }).stderr)
            : '';
        log.error({ err, stderr }, 'drizzle-kit push failed');
        return reply.status(500).send({
          success: false,
          message: `Schema push failed: ${stderr || (err instanceof Error ? err.message : String(err))}`,
        });
      }

      // Step 2: Run seed script
      log.info('Running database seed...');
      try {
        execSync('npx tsx src/db/seed.ts', {
          cwd: process.cwd(),
          env: { ...process.env, ...envValues },
          stdio: 'pipe',
          timeout: 60_000,
        });
        log.info('✅ Database seeded');
      } catch (err) {
        const stderr =
          err instanceof Error && 'stderr' in err
            ? String((err as NodeJS.ErrnoException & { stderr: unknown }).stderr)
            : '';
        log.error({ err, stderr }, 'Seed script failed');
        return reply.status(500).send({
          success: false,
          message: `Seed failed: ${stderr || (err instanceof Error ? err.message : String(err))}`,
        });
      }

      return reply.send({
        success: true,
        message: 'Database initialized successfully. Restart the server to begin.',
      });
    } catch (err) {
      log.error(err, 'Initialization failed');
      return reply.status(500).send({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // ────────────────────────────────────────────────────────────
  // POST /api/setup/restart
  // ────────────────────────────────────────────────────────────
  app.post('/setup/restart', async (_request, reply) => {
    log.info('🔄 Restart requested via setup wizard');

    // Send the response before exiting
    await reply.send({
      success: true,
      message: 'Restarting server... PM2 or the process manager will bring it back up.',
    });

    // Give the response time to flush, then exit
    setTimeout(() => {
      log.info('Exiting process for restart...');
      process.exit(0);
    }, 500);
  });

  log.info('Setup API routes registered');
}
