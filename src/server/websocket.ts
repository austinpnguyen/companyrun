// ============================================================
// WebSocket Manager — Socket.io real-time event layer
// ============================================================

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { createLogger } from '../shared/logger.js';

const log = createLogger('server:websocket');

// ============================================================
// WebSocketManager
// ============================================================

export class WebSocketManager {
  private io: SocketIOServer | null = null;

  // ----------------------------------------------------------
  // Initialize Socket.io on the underlying HTTP server
  // ----------------------------------------------------------

  initialize(server: HttpServer): void {
    if (this.io) {
      log.warn('WebSocket manager already initialized');
      return;
    }

    this.io = new SocketIOServer(server, {
      cors: {
        origin: '*', // Allow all origins in dev; restrict in production
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket) => {
      log.info({ socketId: socket.id }, 'Client connected');

      socket.on('disconnect', (reason) => {
        log.info({ socketId: socket.id, reason }, 'Client disconnected');
      });

      // Echo back pings for client-side latency measurement
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });

    log.info('WebSocket manager initialized');
  }

  // ----------------------------------------------------------
  // Get the Socket.io server instance
  // ----------------------------------------------------------

  getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('WebSocket manager not initialized — call initialize() first');
    }
    return this.io;
  }

  // ----------------------------------------------------------
  // Event emitters
  // ----------------------------------------------------------

  /** Emit agent status change to all connected clients */
  emitAgentStatus(agentId: string, status: string): void {
    if (!this.io) return;
    this.io.emit('agent:status', { agentId, status, timestamp: Date.now() });
    log.debug({ agentId, status }, 'Emitted agent:status');
  }

  /** Emit task progress update */
  emitTaskUpdate(taskId: string, status: string, data?: unknown): void {
    if (!this.io) return;
    this.io.emit('task:update', { taskId, status, data, timestamp: Date.now() });
    log.debug({ taskId, status }, 'Emitted task:update');
  }

  /** Emit a pending orchestrator decision */
  emitDecisionPending(decision: unknown): void {
    if (!this.io) return;
    this.io.emit('orchestrator:decision', { decision, timestamp: Date.now() });
    log.debug('Emitted orchestrator:decision');
  }

  /** Emit a new economy transaction */
  emitTransaction(transaction: unknown): void {
    if (!this.io) return;
    this.io.emit('economy:transaction', { transaction, timestamp: Date.now() });
    log.debug('Emitted economy:transaction');
  }

  /** Emit a real-time chat message */
  emitChatMessage(conversationId: string, message: unknown): void {
    if (!this.io) return;
    this.io.emit('chat:message', { conversationId, message, timestamp: Date.now() });
    log.debug({ conversationId }, 'Emitted chat:message');
  }

  /** Emit system heartbeat pulse */
  emitHeartbeat(status: unknown): void {
    if (!this.io) return;
    this.io.emit('system:heartbeat', { status, timestamp: Date.now() });
  }

  // ----------------------------------------------------------
  // Shutdown
  // ----------------------------------------------------------

  async close(): Promise<void> {
    if (this.io) {
      this.io.close();
      this.io = null;
      log.info('WebSocket manager closed');
    }
  }
}

// ============================================================
// Singleton
// ============================================================

export const wsManager = new WebSocketManager();
