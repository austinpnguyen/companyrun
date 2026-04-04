import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  company,
  agentTemplates,
  agents,
  skills,
  agentSkills,
  tasks,
  conversations,
  messages,
  wallets,
  transactions,
  kpiMetrics,
  performanceReviews,
  activityLog,
  llmProviders,
  llmUsage,
  orchestratorState,
} from '../db/schema.js';

// ============================================================
// Database Model Types (select / insert)
// ============================================================

// Core
export type Company = InferSelectModel<typeof company>;
export type NewCompany = InferInsertModel<typeof company>;

export type AgentTemplate = InferSelectModel<typeof agentTemplates>;
export type NewAgentTemplate = InferInsertModel<typeof agentTemplates>;

export type Agent = InferSelectModel<typeof agents>;
export type NewAgent = InferInsertModel<typeof agents>;

export type Skill = InferSelectModel<typeof skills>;
export type NewSkill = InferInsertModel<typeof skills>;

export type AgentSkill = InferSelectModel<typeof agentSkills>;
export type NewAgentSkill = InferInsertModel<typeof agentSkills>;

export type Task = InferSelectModel<typeof tasks>;
export type NewTask = InferInsertModel<typeof tasks>;

export type Conversation = InferSelectModel<typeof conversations>;
export type NewConversation = InferInsertModel<typeof conversations>;

export type Message = InferSelectModel<typeof messages>;
export type NewMessage = InferInsertModel<typeof messages>;

// Economy
export type Wallet = InferSelectModel<typeof wallets>;
export type NewWallet = InferInsertModel<typeof wallets>;

export type Transaction = InferSelectModel<typeof transactions>;
export type NewTransaction = InferInsertModel<typeof transactions>;

// Performance
export type KpiMetric = InferSelectModel<typeof kpiMetrics>;
export type NewKpiMetric = InferInsertModel<typeof kpiMetrics>;

export type PerformanceReview = InferSelectModel<typeof performanceReviews>;
export type NewPerformanceReview = InferInsertModel<typeof performanceReviews>;

export type ActivityLogEntry = InferSelectModel<typeof activityLog>;
export type NewActivityLogEntry = InferInsertModel<typeof activityLog>;

// System
export type LlmProvider = InferSelectModel<typeof llmProviders>;
export type NewLlmProvider = InferInsertModel<typeof llmProviders>;

export type LlmUsageEntry = InferSelectModel<typeof llmUsage>;
export type NewLlmUsageEntry = InferInsertModel<typeof llmUsage>;

export type OrchestratorState = InferSelectModel<typeof orchestratorState>;
export type NewOrchestratorState = InferInsertModel<typeof orchestratorState>;

// ============================================================
// Enums / Literal Types
// ============================================================

export type AgentStatus = 'active' | 'warning' | 'review' | 'suspended' | 'fired' | 'archived';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export type TaskStatus =
  | 'created'
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'in_review'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ConversationType = 'chat' | 'task' | 'review' | 'system';

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type TransactionType = 'earning' | 'penalty' | 'bonus' | 'wage' | 'expense' | 'transfer';

export type ReviewRecommendation = 'promote' | 'maintain' | 'warn' | 'review' | 'fire';

// ============================================================
// Application Types
// ============================================================

/** Health check response */
export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  uptime: number;
}

/** Generic paginated response */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Generic API error response */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: unknown;
}
