// ============================================================
// Agent Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api';
import type { Agent } from '../types';

interface AgentState {
  agents: Agent[];
  selectedAgent: Agent | null;
  loading: boolean;
  error: string | null;

  fetchAgents: (status?: string) => Promise<void>;
  fetchAgent: (id: string) => Promise<void>;
  hireAgent: (data: { templateRole?: string; name: string }) => Promise<void>;
  fireAgent: (id: string, reason: string) => Promise<void>;
  clearError: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  agents: [],
  selectedAgent: null,
  loading: false,
  error: null,

  fetchAgents: async (status?: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.getAgents(status ? { status } : undefined);
      set({ agents: res.agents, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchAgent: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const res = await api.getAgent(id);
      set({ selectedAgent: res.agent, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  hireAgent: async (data) => {
    set({ loading: true, error: null });
    try {
      await api.hireAgent(data);
      // Re-fetch the list after hiring
      const res = await api.getAgents();
      set({ agents: res.agents, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fireAgent: async (id: string, reason: string) => {
    set({ loading: true, error: null });
    try {
      await api.fireAgent(id, reason);
      // Re-fetch after firing
      const res = await api.getAgents();
      set({ agents: res.agents, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
