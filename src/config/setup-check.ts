/**
 * Configuration checker — reads .env file directly (NOT process.env)
 * to determine if the app is configured or still has placeholder values.
 *
 * Used by the boot logic to decide whether to start in setup mode
 * or normal operation mode.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

// ── Field definitions ────────────────────────────────────────

/** Fields that MUST have real values for the app to start normally */
const REQUIRED_FIELDS = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
] as const;

/** Fields that are optional but should be shown in the setup wizard */
const OPTIONAL_FIELDS = [
  'OPENROUTER_API_KEY',
  'TOGETHERAI_API_KEY',
  'ASKCODI_API_KEY',
  'NINE_ROUTER_API_KEY',
] as const;

/** All config fields the wizard knows about (required + optional + settings) */
const SETTING_FIELDS = [
  'PORT',
  'NODE_ENV',
  'INITIAL_COMPANY_BUDGET',
  'DEFAULT_TASK_REWARD',
  'IDLE_PENALTY_PER_HOUR',
  'KPI_REVIEW_INTERVAL_HOURS',
  'KPI_WARNING_THRESHOLD',
  'KPI_FIRE_THRESHOLD',
  'KPI_FIRE_CONSECUTIVE_REVIEWS',
  'ORCHESTRATOR_HEARTBEAT_MS',
  'ORCHESTRATOR_MODEL',
  'ORCHESTRATOR_PROVIDER',
] as const;

/**
 * Patterns that indicate a value is still a placeholder and not
 * a real credential. Matched case-insensitively.
 */
const PLACEHOLDER_PATTERNS = [
  'your-project',
  'your-anon-key',
  'your_',
  'sk-or-...',
  'CHANGE_ME',
  'placeholder',
  'example',
] as const;

// ── Types ────────────────────────────────────────────────────

export interface FieldStatus {
  set: boolean;
  placeholder: boolean;
  /** Masked value — first 4 + last 4 chars, rest replaced with asterisks */
  maskedValue?: string;
}

export interface ConfigStatus {
  configured: boolean;
  fields: Record<string, FieldStatus>;
  requiredMissing: string[];
  optionalMissing: string[];
}

// ── Helpers ──────────────────────────────────────────────────

const ENV_PATH = join(process.cwd(), '.env');
const ENV_EXAMPLE_PATH = join(process.cwd(), '.env.example');

/**
 * Check if a value looks like a placeholder rather than a real credential.
 */
function isPlaceholder(value: string): boolean {
  if (!value || value.trim() === '') return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => lower.includes(pattern.toLowerCase()));
}

/**
 * Mask a sensitive value for API responses.
 * Shows first 4 and last 4 characters, rest as asterisks.
 * Values shorter than 10 chars are fully masked.
 */
export function maskValue(value: string): string {
  if (!value || value.length === 0) return '';
  if (value.length < 10) return '****';
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

/**
 * Read and parse the .env file. Falls back to .env.example if .env doesn't exist.
 * Returns the parsed key-value pairs and which file was read.
 */
export function readEnvFile(): { values: Record<string, string>; source: string } {
  if (existsSync(ENV_PATH)) {
    const content = readFileSync(ENV_PATH, 'utf-8');
    return { values: parseDotenv(Buffer.from(content)), source: '.env' };
  }

  if (existsSync(ENV_EXAMPLE_PATH)) {
    const content = readFileSync(ENV_EXAMPLE_PATH, 'utf-8');
    return { values: parseDotenv(Buffer.from(content)), source: '.env.example' };
  }

  return { values: {}, source: 'none' };
}

// ── Main exports ─────────────────────────────────────────────

/**
 * Get detailed status of every configuration field.
 */
export function getConfigStatus(): ConfigStatus {
  const { values } = readEnvFile();

  const allFields = [
    ...REQUIRED_FIELDS,
    ...OPTIONAL_FIELDS,
    ...SETTING_FIELDS,
  ];

  const fields: Record<string, FieldStatus> = {};

  for (const field of allFields) {
    const raw = values[field] ?? '';
    const isEmpty = raw.trim() === '';
    const placeholder = isPlaceholder(raw);

    fields[field] = {
      set: !isEmpty && !placeholder,
      placeholder,
      maskedValue: isEmpty ? undefined : maskValue(raw),
    };
  }

  const requiredMissing = REQUIRED_FIELDS.filter(
    (f) => !fields[f]?.set,
  ) as unknown as string[];

  const optionalMissing = OPTIONAL_FIELDS.filter(
    (f) => !fields[f]?.set,
  ) as unknown as string[];

  return {
    configured: requiredMissing.length === 0,
    fields,
    requiredMissing,
    optionalMissing,
  };
}

/**
 * Quick check: is the app fully configured and ready to start normally?
 * Returns false if .env is missing, or if any required field has placeholder values.
 */
export function checkIfConfigured(): boolean {
  return getConfigStatus().configured;
}
