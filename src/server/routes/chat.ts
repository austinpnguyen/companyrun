// ============================================================
// Chat Routes — /api/chat
// ============================================================

import type { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { conversations, messages } from '../../db/schema.js';
import { orchestrator } from '../../orchestrator/index.js';
import { agentManager } from '../../agents/index.js';
import { wsManager } from '../websocket.js';
import { createLogger } from '../../shared/logger.js';
import { NotFoundError, ValidationError } from '../../shared/errors.js';

const log = createLogger('server:routes:chat');

export default async function chatRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /api/chat — send message ─────────────────────────
  app.post('/chat', async (request, reply) => {
    const body = request.body as {
      agentId?: string;
      message?: string;
      conversationId?: string;
    } | null;
    log.debug({ body }, 'POST /api/chat');

    if (!body?.message || body.message.trim().length === 0) {
      throw new ValidationError('message is required');
    }

    const messageText = body.message.trim();

    // If agentId is specified, route to agent; otherwise route to orchestrator
    if (body.agentId) {
      // Route to specific agent
      const agent = await agentManager.getAgent(body.agentId);
      if (!agent) {
        throw new NotFoundError('Agent', body.agentId);
      }

      // Get or create conversation
      let conversationId = body.conversationId;
      if (!conversationId) {
        const [conv] = await db
          .insert(conversations)
          .values({
            agentId: body.agentId,
            type: 'chat',
          })
          .returning();
        conversationId = conv.id;
      }

      // Store user message
      await db.insert(messages).values({
        conversationId,
        role: 'user',
        content: messageText,
      });

      // Send to agent runtime
      const result = await agentManager.sendMessage(
        body.agentId,
        conversationId,
        messageText,
      );

      // Store assistant response
      await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        content: result.response,
        toolCalls: result.toolCalls.length > 0 ? result.toolCalls : null,
        tokenCount: result.tokensUsed.prompt + result.tokensUsed.completion,
      });

      // Emit WebSocket event
      wsManager.emitChatMessage(conversationId, {
        role: 'assistant',
        content: result.response,
        agentId: body.agentId,
        agentName: agent.name,
      });

      return reply.send({
        conversationId,
        response: result.response,
        toolCalls: result.toolCalls,
        tokensUsed: result.tokensUsed,
      });
    } else {
      // Route to orchestrator
      const response = await orchestrator.processCommand(messageText);

      // Get or create orchestrator conversation
      let conversationId = body.conversationId;
      if (!conversationId) {
        const [conv] = await db
          .insert(conversations)
          .values({
            type: 'chat',
          })
          .returning();
        conversationId = conv.id;
      }

      // Store user message
      await db.insert(messages).values({
        conversationId,
        role: 'user',
        content: messageText,
      });

      // Store orchestrator response
      await db.insert(messages).values({
        conversationId,
        role: 'assistant',
        content: response,
      });

      // Emit WebSocket event
      wsManager.emitChatMessage(conversationId, {
        role: 'assistant',
        content: response,
        source: 'orchestrator',
      });

      return reply.send({
        conversationId,
        response,
        source: 'orchestrator',
      });
    }
  });

  // ── GET /api/chat/conversations — list conversations ──────
  app.get('/chat/conversations', async (request, reply) => {
    const query = request.query as {
      agentId?: string;
      limit?: string;
      offset?: string;
    };
    log.debug({ query }, 'GET /api/chat/conversations');

    const limit = query.limit ? parseInt(query.limit, 10) : 50;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    let rows;
    if (query.agentId) {
      rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.agentId, query.agentId))
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset);
    } else {
      rows = await db
        .select()
        .from(conversations)
        .orderBy(desc(conversations.updatedAt))
        .limit(limit)
        .offset(offset);
    }

    return reply.send({ conversations: rows, total: rows.length });
  });

  // ── GET /api/chat/conversations/:id — conversation messages
  app.get('/chat/conversations/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { limit?: string; offset?: string };
    log.debug({ conversationId: id }, 'GET /api/chat/conversations/:id');

    // Verify conversation exists
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id))
      .limit(1);

    if (!conv) {
      throw new NotFoundError('Conversation', id);
    }

    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;

    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt)
      .limit(limit)
      .offset(offset);

    return reply.send({
      conversation: conv,
      messages: msgs,
      total: msgs.length,
    });
  });
}
