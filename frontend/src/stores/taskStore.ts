// ============================================================
// Task Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api';
import type { Task, TaskStats } from '../types';

interface TaskState {
  tasks: Task[];
  stats: TaskStats | null;
  loading: boolean;
  error: string | null;

  fetchTasks: (params?: Record<string, string>) => Promise<void>;
  fetchStats: () => Promise<void>;
  createTask: (data: {
    title: string;
    description?: string;
    priority?: string;
    complexity?: number;
    requiredSkills?: string[];
  }) => Promise<void>;
  updateTaskStatus: (id: string, status: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  stats: null,
  loading: false,
  error: null,

  fetchTasks: async (params?: Record<string, string>) => {
    set({ loading: true, error: null });
    try {
      const res = await api.getTasks(params);
      set({ tasks: res.tasks ?? res.data ?? [], loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchStats: async () => {
    try {
      const res = await api.getTaskStats();
      set({ stats: res.stats });
    } catch (err) {
      console.error('Failed to fetch task stats:', err);
    }
  },

  createTask: async (data) => {
    set({ loading: true, error: null });
    try {
      await api.createTask(data);
      // Re-fetch
      const res = await api.getTasks();
      set({ tasks: res.tasks ?? res.data ?? [], loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  updateTaskStatus: async (id: string, status: string) => {
    try {
      await api.updateTask(id, { status });
      // Re-fetch
      const res = await api.getTasks();
      set({ tasks: res.tasks ?? res.data ?? [] });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  clearError: () => set({ error: null }),
}));
