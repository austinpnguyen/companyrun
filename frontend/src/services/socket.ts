// ============================================================
// Socket.io Client
// ============================================================

import { io } from 'socket.io-client';

const socket = io({
  path: '/socket.io',
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 10,
});

socket.on('connect', () => {
  console.log('[WS] Connected:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('[WS] Disconnected:', reason);
});

socket.on('connect_error', (err) => {
  console.warn('[WS] Connection error:', err.message);
});

export default socket;
