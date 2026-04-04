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
    const recentMessages = await this.getMessages(conversationId);

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
  // Trim messages to fit within a token budget
  // ----------------------------------------------------------

  trimToFit(msgs: LLMMessage[], maxTokens: number): LLMMessage[] {
    if (msgs.length === 0) return [];

    const totalTokens = this.estimateTokens(msgs);
    if (totalTokens <= maxTokens) return msgs;

    // Strategy: drop oldest messages first (keep most recent context)
    const result: LLMMessage[] = [];
    let currentTokens = 0;

    // Walk from newest to oldest, accumulate until budget is hit
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msgTokens = this.estimateTokens([msgs[i]]);
      if (currentTokens + msgTokens > maxTokens) break;
      currentTokens += msgTokens;
      result.unshift(msgs[i]);
    }

    log.debug(
      {
        original: msgs.length,
        trimmed: result.length,
        dropped: msgs.length - result.length,
        tokens: currentTokens,
      },
      'Messages trimmed to fit token budget',
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
