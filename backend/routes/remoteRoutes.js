
const express = require('express');
const {
  requestRemoteSession,
  requestMeetingRemoteSession,
  acceptRemoteSession,
  rejectRemoteSession,
  completeRemoteSession,
} = require('../controllers/remoteController');
const { protect } = require('../middleware/authMiddleware');
const { generateTurnCredentials } = require('../utils/sessionToken');

// This log helps verify that the remote routes file is actually loaded in production
console.log('[remoteRoutes] Initializing /api/remote routes');

const router = express.Router();

// Lightweight debug endpoint to confirm that /api/remote router is mounted correctly
router.get('/debug', (req, res) => {
  res.json({
    ok: true,
    scope: 'remoteRoutes',
    timestamp: new Date().toISOString(),
  });
});

router.post('/request', protect, requestRemoteSession);
// In-meeting remote access (webId-only):
router.post('/meeting-request', protect, requestMeetingRemoteSession);

router.post('/accept', protect, acceptRemoteSession);
router.post('/reject', protect, rejectRemoteSession);
router.post('/session/:id/complete', protect, completeRemoteSession);
router.post('/complete', protect, completeRemoteSession);

/**
 * GET /api/remote/turn-token
 * Returns TURN/STUN configuration
 */
// GET /api/remote/turn-token
router.get('/turn-token', (req, res) => {
  try {
    let username = 'anonymous';

    // 1. Manually check auth header since this route is public but we prefer auth for TURN
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = require('jsonwebtoken').decode(token);
        if (decoded && (decoded.id || decoded._id)) {
          username = String(decoded.id || decoded._id);
        }
      } catch (e) {
        // ignore invalid token
      }
    }

    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    const hasTurnEnv = process.env.TURN_URL && process.env.TURN_SECRET;

    if (hasTurnEnv) {
      // Use configured TURN server
      try {
        const turnCreds = generateTurnCredentials(username, 86400);
        if (turnCreds) {
          iceServers.push({
            urls: process.env.TURN_URL,
            username: turnCreds.username,
            credential: turnCreds.password,
          });
        }
      } catch (err) {
        console.error('[TURN] generateTurnCredentials failed:', err.message);
      }
    } else {
      // Fallback to OpenRelay (Free Tier) if no env var
      // This ensures we always have SOME relay capability
      iceServers.push({
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      });
      iceServers.push({
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      });
    }

    return res.json({ iceServers });
  } catch (err) {
    console.error('[TURN] /turn-token route error:', err);
    // Still return STUN/OpenRelay fallback
    return res.status(200).json({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject',
        }
      ],
    });
  }
});

module.exports = router;


