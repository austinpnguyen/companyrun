import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // CORS — comma-separated allowed origins for cross-origin frontend deployments
  // e.g. "http://localhost:5173,http://192.168.0.100"
  // Leave unset when frontend is served by Fastify itself (same-origin).
  ALLOWED_ORIGINS: z.string().optional(),

  // Database — optional so the setup wizard can run before DB is configured
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  DATABASE_URL: z.string().optional(),

  // LLM Providers
  OPENROUTER_API_KEY: z.string().optional().default(''),
  TOGETHERAI_API_KEY: z.string().optional().default(''),
  ASKCODI_API_KEY: z.string().optional().default(''),
  NINE_ROUTER_API_KEY: z.string().optional().default(''),

  // Economy
  INITIAL_COMPANY_BUDGET: z.coerce.number().default(10000),
  DEFAULT_TASK_REWARD: z.coerce.number().default(10),
  IDLE_PENALTY_PER_HOUR: z.coerce.number().default(1),

  // KPI
  KPI_REVIEW_INTERVAL_HOURS: z.coerce.number().default(24),
  KPI_WARNING_THRESHOLD: z.coerce.number().default(50),
  KPI_FIRE_THRESHOLD: z.coerce.number().default(40),
  KPI_FIRE_CONSECUTIVE_REVIEWS: z.coerce.number().default(3),

  // Orchestrator
  ORCHESTRATOR_HEARTBEAT_MS: z.coerce.number().default(30000),
  ORCHESTRATOR_MODEL: z.string().default('openai/gpt-4o-mini'),
  ORCHESTRATOR_PROVIDER: z.string().default('openrouter'),

  // Stall detection (from agent monitoring system)
  STALL_THRESHOLD_MS: z.coerce.number().default(1800000), // 30 min
  MAX_AUTO_REBOOTS: z.coerce.number().default(2),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.format();
    const missing = Object.entries(formatted)
      .filter(([key, val]) => key !== '_errors' && val && typeof val === 'object' && '_errors' in val && (val as { _errors: string[] })._errors.length > 0)
      .map(([key, val]) => `  ${key}: ${(val as { _errors: string[] })._errors.join(', ')}`)
      .join('\n');

    throw new Error(`❌ Invalid environment variables:\n${missing}`);
  }

  return result.data;
}

/** Validated environment configuration */
export const env = loadEnv();
