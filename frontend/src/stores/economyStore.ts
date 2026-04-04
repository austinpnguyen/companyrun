// ============================================================
// Economy Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api';
import type { EconomyOverview, LeaderboardEntry, Transaction } from '../types';

interface EconomyState {
  overview: EconomyOverview | null;
  leaderboard: LeaderboardEntry[];
  transactions: Transaction[];
  loading: boolean;
  error: string | null;

  fetchOverview: () => Promise<void>;
  fetchLeaderboard: (limit?: number) => Promise<void>;
  fetchTransactions: (agentId: string) => Promise<void>;
  clearError: () => void;
}

export const useEconomyStore = create<EconomyState>((set) => ({
  overview: null,
  leaderboard: [],
  transactions: [],
  loading: false,
  error: null,

  fetchOverview: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.getEconomyOverview();
      set({ overview: res.overview, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchLeaderboard: async (limit?: number) => {
    try {
      const res = await api.getLeaderboard(limit);
      set({ leaderboard: res.leaderboard });
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  },

  fetchTransactions: async (agentId: string) => {
    try {
      const res = await api.getTransactions({ agentId });
      set({ transactions: res.transactions ?? res.data ?? [] });
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
    }
  },

  clearError: () => set({ error: null }),
}));
