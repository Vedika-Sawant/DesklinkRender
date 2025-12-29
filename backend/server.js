// server.js

const express = require('express');
const http = require('http');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const contactsRoutes = require('./routes/contactsRoutes');
const messagingRoutes = require('./routes/messagingRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const contactLinkRoutes = require('./routes/contactLinkRoutes');
const remoteRoutes = require('./routes/remoteRoutes');
const agentProvisionRoutes = require('./routes/agentProvisionRoutes');
const { createSocketServer } = require('./socketManager');

// Load environment variables
dotenv.config();

// Connect to the database
connectDB();

// Initialize Express app
const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Dynamic CORS configuration: allow localhost, trycloudflare tunnels, and any
// origins explicitly listed in CLIENT_ORIGIN (comma-separated).
const allowedOrigins = new Set(
  CLIENT_ORIGIN.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser clients, mobile apps, curl

  try {
    const url = new URL(origin);
    const host = url.host || '';

    // 1. Allow localhost (dev)
    if (
      host.startsWith('localhost:') ||
      host.startsWith('127.0.0.1:') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    ) {
      return true;
    }

    // 2. Allow Cloudflare tunnels (*.trycloudflare.com)
    if (host.endsWith('.trycloudflare.com')) {
      // console.log('[CORS] Allowing Cloudflare tunnel:', origin);
      return true;
    }

    // 3. Allow Render domains (*.onrender.com)
    if (host.endsWith('.onrender.com')) {
      return true;
    }

    // 4. Check explicit allowed origins list (e.g. env var)
    if (allowedOrigins.has(origin)) {
      return true;
    }

    // 5. Allow some common variations if needed or development
    // Just in case the origin string comes in without protocol for some reason (rare for valid browsers)
    if (allowedOrigins.has(host)) return true;

  } catch (e) {
    console.error('[CORS] Error parsing origin:', origin, e);
    // If URL parsing fails, fall back to exact match
    if (allowedOrigins.has(origin)) return true;
  }

  return false;
}

const corsOptions = {
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      // Pass null, true to reflect the origin in Access-Control-Allow-Origin
      return callback(null, true);
    }

    console.warn('[CORS] Blocked origin:', origin);
    // Be explicit about why we blocked it in logs
    // For now, to "fix at any cost", if we are unsure, we might want to default allow 
    // BUT explicit allow of trycloudflare.com above should cover it.
    // If you are extremely desperate, uncomment the next line to open to ALL (insecure):
    // return callback(null, true); 

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-device-id', 'x-user-id', 'x-user-name'],
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/messages', messagingRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/contact-links', contactLinkRoutes);
app.use('/api/remote', remoteRoutes);
app.use('/api/agent', agentProvisionRoutes);

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
createSocketServer(server, CLIENT_ORIGIN);

// Metrics endpoint for observability
app.get('/metrics', (req, res) => {
  const { getMetrics } = require('./socketManager');
  const metrics = getMetrics ? getMetrics() : {};

  // Prometheus-style text format
  const lines = [
    '# HELP desklink_active_sessions Number of active remote sessions',
    '# TYPE desklink_active_sessions gauge',
    `desklink_active_sessions ${metrics.activeSessions || 0}`,
    '',
    '# HELP desklink_offers_relayed_total Total WebRTC offers relayed',
    '# TYPE desklink_offers_relayed_total counter',
    `desklink_offers_relayed_total ${metrics.offersRelayed || 0}`,
    '',
    '# HELP desklink_ice_failures_total Total ICE candidate failures',
    '# TYPE desklink_ice_failures_total counter',
    `desklink_ice_failures_total ${metrics.iceFailures || 0}`,
    '',
    '# HELP desklink_datachannel_msgs_total Total datachannel messages',
    '# TYPE desklink_datachannel_msgs_total counter',
    `desklink_datachannel_msgs_total ${metrics.datachannelMsgs || 0}`,
  ];

  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(lines.join('\n'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Define the port
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
