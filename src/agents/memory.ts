// ============================================================
// Agent Memory — conversation context management with DB persistence
// ============================================================

import { eq, desc } from 'drizzle-orm';
import { db } from '../config/database.js';
import { conversations, messages } from '../db/schema.js';
import { createLogger } from '../shared/logger.js';
import type { LLMMessage } from '../llm/providers/base.js';

const log = createLogger('agents:memory');

// Rough token estimate: ~4 characters per token
const CHARS_PER_TOKEN = 4;

// ============================================================
// AgentMemory
// ============================================================

export class AgentMemory {
  private agentId: string;
  private maxMessages: number;
  private maxTokenEstimate: number;

  constructor(
    agentId: string,
    options?: { maxMessages?: number; maxTokenEstimate?: number },
  ) {
    this.agentId = agentId;
    this.maxMessages = options?.maxMessages ?? 50;
    this.maxTokenEstimate = options?.maxTokenEstimate ?? 8000;
  }

  // ----------------------------------------------------------
  // Add a message to a conversation
  // ----------------------------------------------------------

  async addMessage(conversationId: string, message: LLMMessage): Promise<void> {
    try {
      await db.insert(messages).values({
        conversationId,
        role: message.role,
        content: message.content ?? '',
        toolCalls: message.tool_calls ?? null,
        tokenCount: this.estimateTokens([message]),
      });

      log.debug(
        { agentId: this.agentId, conversationId, role: message.role },
        'Message stored',
      );
    } catch (error) {
      log.error(
        { error, agentId: this.agentId, conversationId },
        'Failed to store message',
      );
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Get messages for a conversation (within context window)
  // ----------------------------------------------------------

  async getMessages(
    conversationId: string,
    limit?: number,
  ): Promise<LLMMessage[]> {
    const effectiveLimit = limit ?? this.maxMessages;

    try {
      const rows = await db
        .select({
          role: messages.role,
          content: messages.content,
          toolCalls: messages.toolCalls,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(effectiveLimit);

      // Reverse so oldest is first (we fetched newest-first for the LIMIT)
      rows.reverse();

      return rows.map((row) => {
        const msg: LLMMessage = {
          role: row.role as LLMMessage['role'],
          content: row.content,
        };
        if (row.toolCalls) {
          msg.tool_calls = row.toolCalls as LLMMessage['tool_calls'];
        }
        return msg;
      });
    } catch (error) {
      log.error(
        { error, agentId: this.agentId, conversationId },
        'Failed to fetch messages',
      );
      return [];
    }
  }

  // ----------------------------------------------------------
  // Build full context for an LLM call (system + recent msgs)
  // ----------------------------------------------------------

  async buildContext(
    conversationId: string,
    systemPrompt: string,
  ): Promise<LLMMessage[]> {
    const systemMessage: LLMMessage = {
      role: 'system',
      content: systemPrompt,
    };

    const systemTokens = this.estimateTokens([systemMessage]);
    const remainingBudget = this.maxTokenEstimate - systemTokens;

    // Fetch recent messages
    const rawMessages = await this.getMessages(conversationId);

    // Truncate assistant message content before injection to prevent prompt explosion
    const recentMessages = rawMessages.map((msg) => {
      if (msg.role === 'assistant' && msg.content) {
        return { ...msg, content: this.truncateForInjection(msg.content) };
      }
      return msg;
    });

    // Trim to fit within the token budget
    const trimmed = this.trimToFit(recentMessages, remainingBudget);

    log.debug(
      {
        agentId: this.agentId,
        conversationId,
        totalMessages: recentMessages.length,
        trimmedMessages: trimmed.length,
        estimatedTokens: systemTokens + this.estimateTokens(trimmed),
      },
      'Context built',
    );

    return [systemMessage, ...trimmed];
  }

  // ----------------------------------------------------------
  // Truncate text to maxChars for context injection safety
  // ----------------------------------------------------------

  truncateForInjection(text: string, maxChars = 2000): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n...[truncated for context limit]';
  }

  // ----------------------------------------------------------
  // Estimate token count for messages (~4 chars per token)
  // ----------------------------------------------------------

  estimateTokens(msgs: LLMMessage[]): number {
    let totalChars = 0;

    for (const msg of msgs) {
      // Role overhead: ~4 tokens per message for role + formatting
      totalChars += 16;
      totalChars += (msg.content ?? '').length;

      if (msg.tool_calls) {
        totalChars += JSON.stringify(msg.tool_calls).length;
      }
    }

    return Math.ceil(totalChars / CHARS_PER_TOKEN);
  }

  // ----------------------------------------------------------
  // 2-phase context compression (hermes-agent pattern)
  //
  // Phase 1 — Content pruning: shrink large tool/assistant
  //   messages in the "middle" section without dropping them.
  //   Tool results > 600 chars are truncated; assistant > 1000.
  //
  // Phase 2 — Drop oldest: if still over budget after pruning,
  //   drop from the front (oldest) while protecting the last
  //   TAIL_PROTECT messages so recent context is always intact.
  // ----------------------------------------------------------

  /** Number of recent messages always kept intact (tail guard) */
  private static readonly TAIL_PROTECT = 12;
  /** Max chars for tool result content before pruning */
  private static readonly TOOL_MAX_CHARS = 600;
  /** Max chars for assistant message before pruning */
  private static readonly ASST_MAX_CHARS = 1000;

  trimToFit(msgs: LLMMessage[], maxTokens: number): LLMMessage[] {
    if (msgs.length === 0) return [];

    const totalTokens = this.estimateTokens(msgs);
    if (totalTokens <= maxTokens) return msgs;

    const tail = AgentMemory.TAIL_PROTECT;

    // ── Phase 1: Prune large content from middle messages ──
    const prunedMsgs: LLMMessage[] = msgs.map((msg, idx) => {
      // Always keep tail messages intact
      if (idx >= msgs.length - tail) return msg;

      if (msg.role === 'tool' && msg.content && msg.content.length > AgentMemory.TOOL_MAX_CHARS) {
        return {
          ...msg,
          content: msg.content.slice(0, AgentMemory.TOOL_MAX_CHARS)
            + `\n...[tool output pruned — ${msg.content.length - AgentMemory.TOOL_MAX_CHARS} chars removed]`,
        };
      }
      if (msg.role === 'assistant' && msg.content && msg.content.length > AgentMemory.ASST_MAX_CHARS) {
        return {
          ...msg,
          content: msg.content.slice(0, AgentMemory.ASST_MAX_CHARS)
            + `\n...[response truncated]`,
        };
      }
      return msg;
    });

    const afterPhase1 = this.estimateTokens(prunedMsgs);
    if (afterPhase1 <= maxTokens) {
      log.debug(
        { original: msgs.length, phaseApplied: 'prune-only', tokens: afterPhase1 },
        'Context compressed via content pruning',
      );
      return prunedMsgs;
    }

    // ── Phase 2: Drop oldest (protect last TAIL_PROTECT msgs) ──
    const protected_ = prunedMsgs.slice(-tail);
    const candidates = prunedMsgs.slice(0, -tail);

    const protectedTokens = this.estimateTokens(protected_);
    const remainingBudget = maxTokens - protectedTokens;
    let budgetUsed = 0;
    const kept: LLMMessage[] = [];

    // Walk backwards through candidates (newest of the non-tail first)
    for (let i = candidates.length - 1; i >= 0; i--) {
      const t = this.estimateTokens([candidates[i]]);
      if (budgetUsed + t > remainingBudget) break;
      budgetUsed += t;
      kept.unshift(candidates[i]);
    }

    const result = [...kept, ...protected_];

    log.debug(
      {
        original: msgs.length,
        afterPrune: prunedMsgs.length,
        dropped: prunedMsgs.length - result.length,
        final: result.length,
        tokens: budgetUsed + protectedTokens,
      },
      'Context compressed via 2-phase: prune + drop',
    );

    return result;
  }

  // ----------------------------------------------------------
  // Ensure a conversation exists, returning its ID
  // ----------------------------------------------------------

  async ensureConversation(
    conversationId: string,
    type: string = 'chat',
  ): Promise<string> {
    // Check if conversation exists
    const existing = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create a new conversation
    const [created] = await db
      .insert(conversations)
      .values({
        id: conversationId,
        agentId: this.agentId,
        type,
      })
      .returning({ id: conversations.id });

    log.info(
      { agentId: this.agentId, conversationId: created.id },
      'Conversation created',
    );

    return created.id;
  }

  // ----------------------------------------------------------
  // Clear all memory for a specific conversation
  // ----------------------------------------------------------

  async clearConversation(conversationId: string): Promise<void> {
    try {
      await db
        .delete(messages)
        .where(eq(messages.conversationId, conversationId));

      log.info(
        { agentId: this.agentId, conversationId },
        'Conversation memory cleared',
      );
    } catch (error) {
      log.error(
        { error, agentId: this.agentId, conversationId },
        'Failed to clear conversation memory',
      );
      throw error;
    }
  }

  // ----------------------------------------------------------
  // Clear all memory for this agent
  // ----------------------------------------------------------

  async clearAll(): Promise<void> {
    try {
      // Find all conversations for this agent
      const agentConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.agentId, this.agentId));

      // Delete messages from each conversation
      for (const conv of agentConversations) {
        await db
          .delete(messages)
          .where(eq(messages.conversationId, conv.id));
      }

      log.info(
        {
          agentId: this.agentId,
          conversationsCleared: agentConversations.length,
        },
        'All agent memory cleared',
      );
    } catch (error) {
      log.error(
        { error, agentId: this.agentId },
        'Failed to clear all agent memory',
      );
      throw error;
    }
  }
}
