// ============================================================
// API Service — fetch-based client for backend endpoints
// ============================================================

import type { SetupStatus, SetupApiResponse, AgentTemplate, Task } from '../types';

// When VITE_API_URL is set (e.g. "http://192.168.0.141"), calls go cross-origin.
// Empty string = same-origin, which works with the Vite dev proxy and with nginx in production.
const API_BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.message || body.error || `API error ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ── Company ──────────────────────────────────────────────
  getCompany: () => request<any>('/company'),
  updateCompanyConfig: (data: Record<string, unknown>) =>
    request<any>('/company/config', { method: 'PUT', body: JSON.stringify(data) }),
  getCompanyReport: () => request<any>('/company/report'),
  getProviders: () => request<{ providers: Array<{
    id: string;
    displayName: string;
    endpoint: string;
    description: string;
    configured: boolean;
    maskedKey: string;
  }> }>('/company/providers'),

  // ── Agents ───────────────────────────────────────────────
  getAgents: (params?: { status?: string }) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return request<any>(`/agents${qs}`);
  },
  getAgent: (id: string) => request<any>(`/agents/${id}`),
  hireAgent: (data: { templateRole?: string; name: string }) =>
    request<any>('/agents/hire', { method: 'POST', body: JSON.stringify(data) }),
  fireAgent: (id: string, reason: string) =>
    request<any>(`/agents/${id}/fire`, { method: 'POST', body: JSON.stringify({ reason }) }),
  updateAgent: (id: string, data: Record<string, unknown>) =>
    request<any>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getTemplates: () =>
    request<{ templates: AgentTemplate[]; total: number }>('/agents/templates'),
  cancelAgent: (id: string) =>
    request<{ success: boolean }>(`/agents/${id}/cancel`, { method: 'POST' }),

  // ── Tasks ────────────────────────────────────────────────
  getTasks: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params)}` : '';
    return request<any>(`/tasks${qs}`);
  },
  getTask: (id: string) => request<any>(`/tasks/${id}`),
  getTaskStats: () => request<any>('/tasks/stats'),
  createTask: (data: {
    title: string;
    description?: string;
    priority?: string;
    complexity?: number;
    requiredSkills?: string[];
  }) => request<any>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: Record<string, unknown>) =>
    request<any>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id: string) => request<any>(`/tasks/${id}`, { method: 'DELETE' }),
  assignTask: (id: string, agentId: string) =>
    request<any>(`/tasks/${id}/assign`, { method: 'POST', body: JSON.stringify({ agentId }) }),
  reviewTask: (id: string, score: number, feedback: string) =>
    request<any>(`/tasks/${id}/review`, { method: 'POST', body: JSON.stringify({ score, feedback }) }),
  cancelTask: (id: string) =>
    request<{ success: boolean; task: Task }>(`/tasks/${id}/cancel`, { method: 'POST' }),

  // ── Economy ──────────────────────────────────────────────
  getEconomyOverview: (periodDays?: number) => {
    const qs = periodDays ? `?periodDays=${periodDays}` : '';
    return request<any>(`/economy/overview${qs}`);
  },
  getLeaderboard: (limit?: number) => {
    const qs = limit ? `?limit=${limit}` : '';
    return request<any>(`/economy/leaderboard${qs}`);
  },
  getTransactions: (params: { agentId: string; type?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams({ agentId: params.agentId });
    if (params.type) qs.set('type', params.type);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return request<any>(`/economy/transactions?${qs}`);
  },
  adjustBudget: (amount: number, action: 'add' | 'deduct') =>
    request<any>('/economy/budget', { method: 'POST', body: JSON.stringify({ amount, action }) }),
  getEconomyHealth: () => request<any>('/economy/health'),

  // ── Orchestrator ─────────────────────────────────────────
  getOrchestratorStatus: () => request<any>('/orchestrator/status'),
  sendCommand: (command: string) =>
    request<any>('/orchestrator/command', { method: 'POST', body: JSON.stringify({ command }) }),
  getDecisions: () => request<any>('/orchestrator/decisions'),
  approveDecision: (id: string) =>
    request<any>(`/orchestrator/decisions/${id}/approve`, { method: 'POST' }),
  rejectDecision: (id: string) =>
    request<any>(`/orchestrator/decisions/${id}/reject`, { method: 'POST' }),

  // ── Skills ───────────────────────────────────────────────
  getSkills: () => request<any>('/skills'),
  getSkill: (id: string) => request<any>(`/skills/${id}`),
  createSkill: (data: Record<string, unknown>) =>
    request<any>('/skills', { method: 'POST', body: JSON.stringify(data) }),

  // ── Chat ─────────────────────────────────────────────────
  sendMessage: (data: { message: string; agentId?: string; conversationId?: string }) =>
    request<any>('/chat', { method: 'POST', body: JSON.stringify(data) }),
  getConversations: (params?: { agentId?: string; limit?: number }) => {
    const qs = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return request<any>(`/chat/conversations${qs}`);
  },
  getMessages: (conversationId: string, params?: { limit?: number; offset?: number }) => {
    const qs = params ? `?${new URLSearchParams(params as unknown as Record<string, string>)}` : '';
    return request<any>(`/chat/conversations/${conversationId}${qs}`);
  },

  // ── Setup ─────────────────────────────────────────────────
  getSetupStatus: () => request<SetupStatus>('/setup/status'),

  saveSetupConfig: (config: Record<string, string>) =>
    request<SetupApiResponse>('/setup/save', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  testDatabase: (databaseUrl: string) =>
    request<SetupApiResponse>('/setup/test-database', {
      method: 'POST',
      body: JSON.stringify({ databaseUrl }),
    }),

  testLLM: (provider: string, apiKey: string) =>
    request<SetupApiResponse>('/setup/test-llm', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey }),
    }),

  initializeDatabase: () =>
    request<SetupApiResponse>('/setup/initialize', { method: 'POST' }),

  restartServer: () =>
    request<SetupApiResponse>('/setup/restart', { method: 'POST' }),

  getHealthStatus: () => request<{ status: string }>('/health'),
};
