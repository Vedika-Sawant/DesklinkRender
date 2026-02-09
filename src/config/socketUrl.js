// Central helper for choosing the Socket.IO base URL.
// - In development we always use the local backend (http://localhost:5000).
// - In production we prefer VITE_SOCKET_URL when provided, otherwise we
//   derive it from window.location and fall back to the hosted anydesk URL.

// Cache the URL to avoid recomputation
let cachedSocketUrl = null;

export function getSocketUrl() {
  // Return cached value if available
  if (cachedSocketUrl) {
    return cachedSocketUrl;
  }

  const isDev = import.meta.env.DEV;
  const raw = import.meta.env.VITE_SOCKET_URL;

  if (isDev) {
    // Always talk to the local dev backend when running `npm run dev`.
    cachedSocketUrl = 'http://localhost:5000';
    return cachedSocketUrl;
  }

  if (raw && typeof raw === 'string' && raw.trim() !== '') {
    // Ensure no trailing slash so `/socket.io` path concatenation is stable.
    cachedSocketUrl = raw.trim().replace(/\/$/, '');
    return cachedSocketUrl;
  }

  if (typeof window !== 'undefined') {
    const { protocol, host } = window.location;
    // Ensure we use the correct protocol for WebSocket
    const base = protocol === 'https:' ? `https://${host}` : `http://${host}`;
    cachedSocketUrl = base.replace(/\/$/, '');
    return cachedSocketUrl;
  }

  // Safe production default when running in non-browser environments.
  cachedSocketUrl = 'http://localhost:5000';
  return cachedSocketUrl;
}

/**
 * Returns common socket options for all Socket.IO connections.
 * These options help with connection stability and error handling.
 */
export function getSocketOptions(additionalOptions = {}) {
  const isDev = import.meta.env.DEV;
  
  return {
    // Prefer WebSocket, fall back to polling if needed
    transports: ['websocket', 'polling'],
    // Reconnection settings
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: isDev ? 3 : 5,
    // Connection timeout
    timeout: 10000,
    // Auto-connect (set to false if you want to manually connect)
    autoConnect: true,
    ...additionalOptions,
  };
}

/**
 * Check if we're likely able to connect to the socket server.
 * This is a simple heuristic check - actual connectivity should be
 * handled by Socket.IO's built-in reconnection logic.
 */
export function isSocketServerReachable() {
  // In development, assume local server should be running
  if (import.meta.env.DEV) {
    return true;
  }
  
  // In production, we rely on Socket.IO's reconnection logic
  // This function can be extended with actual health check if needed
  return typeof window !== 'undefined' && navigator.onLine;
}
