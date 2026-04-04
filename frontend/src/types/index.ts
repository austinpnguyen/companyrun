// ============================================================
// Frontend Types — matching backend API responses
// ============================================================

// ── Enums ────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'warning' | 'review' | 'suspended' | 'fired' | 'archived';
export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TaskStatus = 'created' | 'queued' | 'assigned' | 'in_progress' | 'in_review' | 'completed' | 'failed' | 'cancelled';
export type ConversationType = 'chat' | 'task' | 'review' | 'system';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type TransactionType = 'earning' | 'penalty' | 'bonus' | 'wage' | 'expense' | 'transfer';

// ── Core Models ──────────────────────────────────────────────

export interface Company {
  id: string;
  name: string;
  description: string | null;
  budgetTotal: string;
  budgetRemaining: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AgentTemplate {
  id: string;
  name: string;
  role: string;
  description: string | null;
  systemPrompt: string;
  defaultModel: string | null;
  defaultProvider: string | null;
  baseWage: string;
  defaultSkills: string[];
  config: Record<string, unknown>;
  createdAt: string;
}

export interface Agent {
  id: string;
  templateId: string | null;
  name: string;
  role: string;
  status: AgentStatus;
  systemPrompt: string;
  model: string;
  provider: string;
  personality: Record<string, unknown>;
  memory: Record<string, unknown>;
  config: Record<string, unknown>;
  hiredAt: string;
  firedAt: string | null;
  fireReason: string | null;
  updatedAt: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string | null;
  mcpServerCommand: string;
  mcpServerArgs: string[];
  mcpServerEnv: Record<string, string>;
  category: string | null;
  difficulty: number;
  isActive: boolean;
  createdAt: string;
}

export interface Task {
  id: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  complexity: number;
  status: TaskStatus;
  requiredSkills: string[];
  assignedAgentId: string | null;
  createdBy: string;
  result: unknown;
  creditReward: string | null;
  deadline: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  agentId: string | null;
  taskId: string | null;
  type: ConversationType;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls: unknown;
  tokenCount: number | null;
  cost: string | null;
  createdAt: string;
}

// ── Economy Models ───────────────────────────────────────────

export interface Wallet {
  id: string;
  agentId: string;
  balance: string;
  totalEarned: string;
  totalSpent: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: string;
  balanceAfter: string;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

// ── Performance Models ───────────────────────────────────────

export interface KpiMetric {
  id: string;
  agentId: string;
  metricName: string;
  metricValue: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface PerformanceReview {
  id: string;
  agentId: string;
  overallScore: string;
  metrics: Record<string, unknown>;
  recommendation: string | null;
  notes: string | null;
  reviewedAt: string;
}

// ── Orchestrator Models ──────────────────────────────────────

export interface OrchestratorStatus {
  status: string;
  lastHeartbeat: string;
  pendingDecisions: Decision[];
  config: Record<string, unknown>;
}

export interface Decision {
  id: string;
  type: string;
  reason: string;
  urgency: string;
  status: 'pending' | 'approved' | 'rejected';
  data?: Record<string, unknown>;
  createdAt?: string;
}

// ── API Response Wrappers ────────────────────────────────────

export interface CompanyOverview {
  company: Company;
  activeAgents: number;
  taskStats: Record<string, number>;
}

export interface EconomyOverview {
  budgetTotal: number;
  budgetRemaining: number;
  totalSpent: number;
  totalEarnings: number;
  totalPenalties: number;
  agentCount: number;
}

export interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  role: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}

// ── Setup Models ─────────────────────────────────────────────

export interface SetupFieldStatus {
  set: boolean;
  placeholder: boolean;
  maskedValue?: string;
}

export interface SetupStatus {
  configured: boolean;
  fields: Record<string, SetupFieldStatus>;
  requiredMissing: string[];
  optionalMissing: string[];
}

export interface SetupApiResponse {
  success: boolean;
  message: string;
  status?: SetupStatus;
}
