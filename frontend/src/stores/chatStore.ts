// ============================================================
// Chat Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { api } from '../services/api';
import type { Conversation, Message } from '../types';

interface ChatState {
  conversations: Conversation[];
  currentConversationId: string | null;
  currentMessages: Message[];
  loading: boolean;
  sending: boolean;
  error: string | null;

  fetchConversations: () => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (data: { message: string; agentId?: string; conversationId?: string }) => Promise<void>;
  setCurrentConversation: (id: string | null) => void;
  addMessage: (msg: Message) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  currentMessages: [],
  loading: false,
  sending: false,
  error: null,

  fetchConversations: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.getConversations();
      set({ conversations: res.conversations, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  fetchMessages: async (conversationId: string) => {
    set({ loading: true, error: null, currentConversationId: conversationId });
    try {
      const res = await api.getMessages(conversationId);
      set({ currentMessages: res.messages, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  sendMessage: async (data) => {
    set({ sending: true, error: null });
    try {
      const res = await api.sendMessage(data);
      const state = get();

      // Add user message locally
      const userMsg: Message = {
        id: crypto.randomUUID(),
        conversationId: res.conversationId ?? state.currentConversationId ?? '',
        role: 'user',
        content: data.message,
        toolCalls: null,
        tokenCount: null,
        cost: null,
        createdAt: new Date().toISOString(),
      };

      // Add assistant response
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        conversationId: res.conversationId ?? state.currentConversationId ?? '',
        role: 'assistant',
        content: res.response,
        toolCalls: res.toolCalls ?? null,
        tokenCount: null,
        cost: null,
        createdAt: new Date().toISOString(),
      };

      set({
        currentMessages: [...state.currentMessages, userMsg, assistantMsg],
        currentConversationId: res.conversationId ?? state.currentConversationId,
        sending: false,
      });

      // Refresh conversation list
      api.getConversations().then((convRes) => {
        set({ conversations: convRes.conversations });
      });
    } catch (err) {
      set({ error: (err as Error).message, sending: false });
    }
  },

  setCurrentConversation: (id) => set({ currentConversationId: id }),

  addMessage: (msg) =>
    set((state) => ({ currentMessages: [...state.currentMessages, msg] })),

  clearError: () => set({ error: null }),
}));
