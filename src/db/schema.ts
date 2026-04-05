import {
  pgTable,
  uuid,
  text,
  decimal,
  jsonb,
  timestamp,
  boolean,
  integer,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// ============================================================
// CORE TABLES
// ============================================================

/** Company configuration — single row for the company instance */
export const company = pgTable('company', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().default('My AI Company'),
  description: text('description'),
  budgetTotal: decimal('budget_total', { precision: 12, scale: 2 }).default('10000.00'),
  budgetRemaining: decimal('budget_remaining', { precision: 12, scale: 2 }).default('10000.00'),
  config: jsonb('config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Agent templates — predefined roles agents can be hired from */
export const agentTemplates = pgTable('agent_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  role: text('role').notNull().unique(),
  description: text('description'),
  systemPrompt: text('system_prompt').notNull(),
  defaultModel: text('default_model'),
  defaultProvider: text('default_provider'),
  baseWage: decimal('base_wage', { precision: 8, scale: 2 }).default('10.00'),
  defaultSkills: text('default_skills').array().default([]),
  /** Organisational tier: 'leadership' | 'worker' | 'specialist' | 'adversarial' */
  tier: text('tier').default('worker'),
  /** Adversarial agents critique rather than produce — wired into review phase */
  isAdversarial: boolean('is_adversarial').default(false),
  /** Which role/area this adversarial agent targets (null for non-adversarial) */
  adversarialTarget: text('adversarial_target'),
  config: jsonb('config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** AI Employees — active agent instances */
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').references(() => agentTemplates.id),
  name: text('name').notNull(),
  role: text('role').notNull(),
  status: text('status').notNull().default('active'),
  systemPrompt: text('system_prompt').notNull(),
  model: text('model').notNull(),
  provider: text('provider').notNull(),
  tier: text('tier').default('worker'),
  isAdversarial: boolean('is_adversarial').default(false),
  personality: jsonb('personality').default({}),
  memory: jsonb('memory').default({}),
  config: jsonb('config').default({}),
  hiredAt: timestamp('hired_at', { withTimezone: true }).defaultNow(),
  firedAt: timestamp('fired_at', { withTimezone: true }),
  fireReason: text('fire_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Skills catalog — MCP server connections as learnable skills */
export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  description: text('description'),
  mcpServerCommand: text('mcp_server_command').notNull(),
  mcpServerArgs: text('mcp_server_args').array().default([]),
  mcpServerEnv: jsonb('mcp_server_env').default({}),
  category: text('category'),
  difficulty: integer('difficulty').default(1),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** Agent-Skill junction — which agents have learned which skills */
export const agentSkills = pgTable(
  'agent_skills',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    learnedAt: timestamp('learned_at', { withTimezone: true }).defaultNow(),
    proficiency: integer('proficiency').default(50),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.skillId] }),
  ],
);

/** Tasks — units of work created by user or orchestrator */
export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentTaskId: uuid('parent_task_id').references((): AnyPgColumn => tasks.id),
  title: text('title').notNull(),
  description: text('description'),
  priority: text('priority').default('normal'),
  complexity: integer('complexity').default(1),
  status: text('status').default('created'),
  requiredSkills: text('required_skills').array().default([]),
  assignedAgentId: uuid('assigned_agent_id').references(() => agents.id),
  createdBy: text('created_by').default('user'),
  result: jsonb('result'),
  creditReward: decimal('credit_reward', { precision: 8, scale: 2 }),
  deadline: timestamp('deadline', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  // ── New: DAG dependency, retry, cron ─────────────────────
  /** IDs of tasks that must complete before this task can run */
  dependsOn: text('depends_on').array().default([]),
  /** Number of retry attempts made so far */
  retryCount: integer('retry_count').default(0),
  /** Maximum number of retries before marking permanently failed */
  maxRetries: integer('max_retries').default(2),
  /** Cron expression (e.g. "every-5-min") — null means one-shot */
  cronExpression: text('cron_expression'),
  /** When this cron task should next fire */
  cronNextRun: timestamp('cron_next_run', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Conversations — chat threads between user/system and agents */
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id').references(() => agents.id),
  taskId: uuid('task_id').references(() => tasks.id),
  type: text('type').default('chat'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Messages — individual messages within conversations */
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls'),
  tokenCount: integer('token_count'),
  cost: decimal('cost', { precision: 8, scale: 6 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// ECONOMY TABLES
// ============================================================

/** Wallets — one per agent, tracks credit balance */
export const wallets = pgTable('wallets', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .unique()
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  balance: decimal('balance', { precision: 12, scale: 2 }).default('0.00'),
  totalEarned: decimal('total_earned', { precision: 12, scale: 2 }).default('0.00'),
  totalSpent: decimal('total_spent', { precision: 12, scale: 2 }).default('0.00'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

/** Transactions — ledger of all credit movements */
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  walletId: uuid('wallet_id')
    .notNull()
    .references(() => wallets.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  amount: decimal('amount', { precision: 8, scale: 2 }).notNull(),
  balanceAfter: decimal('balance_after', { precision: 12, scale: 2 }).notNull(),
  description: text('description'),
  referenceType: text('reference_type'),
  referenceId: uuid('reference_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// PERFORMANCE TABLES
// ============================================================

/** KPI Metrics — raw data points for agent performance */
export const kpiMetrics = pgTable('kpi_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  metricName: text('metric_name').notNull(),
  metricValue: decimal('metric_value', { precision: 8, scale: 4 }).notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** Performance Reviews — periodic agent evaluations */
export const performanceReviews = pgTable('performance_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  overallScore: decimal('overall_score', { precision: 5, scale: 2 }).notNull(),
  metrics: jsonb('metrics').notNull(),
  recommendation: text('recommendation'),
  notes: text('notes'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow(),
});

/** Activity Log — audit trail for all system actions */
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  details: jsonb('details').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// SYSTEM TABLES
// ============================================================

/** LLM Providers — configuration for each LLM provider */
export const llmProviders = pgTable('llm_providers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  baseUrl: text('base_url').notNull(),
  apiKeyEnv: text('api_key_env').notNull(),
  models: jsonb('models').default([]),
  isActive: boolean('is_active').default(true),
  config: jsonb('config').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** LLM Usage — per-request token and cost tracking */
export const llmUsage = pgTable('llm_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  agentId: uuid('agent_id').references(() => agents.id),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  costUsd: decimal('cost_usd', { precision: 8, scale: 6 }),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/** Orchestrator State — persistent state for the CEO daemon */
export const orchestratorState = pgTable('orchestrator_state', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').default('running'),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).defaultNow(),
  pendingDecisions: jsonb('pending_decisions').default([]),
  config: jsonb('config').default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
