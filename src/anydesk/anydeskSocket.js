import { io } from "socket.io-client";
import { getSocketUrl } from '../config/socketUrl.js';

// Use environment-aware socket URL for AnyDesk connections
const SOCKET_URL = getSocketUrl();

// Only create the socket if we're in a browser environment
let anydeskSocket = null;

function createAnyDeskSocket() {
  if (anydeskSocket && anydeskSocket.connected) {
    return anydeskSocket;
  }
  
  anydeskSocket = io(SOCKET_URL, {
    path: "/anydesk",
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5,
    timeout: 10000,
  });

  anydeskSocket.on('connect', () => {
    console.log('[AnyDeskSocket] Connected:', anydeskSocket.id);
  });

  anydeskSocket.on('connect_error', (err) => {
    console.warn('[AnyDeskSocket] Connection error:', err.message);
  });

  anydeskSocket.on('disconnect', (reason) => {
    console.log('[AnyDeskSocket] Disconnected:', reason);
  });

  return anydeskSocket;
}

// Lazy initialization - create socket when first accessed
export { createAnyDeskSocket };
export { anydeskSocket };
