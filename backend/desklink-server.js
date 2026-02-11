const jwt = require('jsonwebtoken');
const Device = require('./models/Device');
const RemoteSession = require('./models/RemoteSession');
const { getMeetingParticipants, emitToUser, emitToDevice } = require('./socketManager');
const { generateSessionToken } = require('./utils/sessionToken');

let ioInstance = null;

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

function generateSessionId() {
  return (Math.random().toString(36).slice(2) + Date.now().toString(36));
}

function getAuthContextFromReq(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  // Allow overriding via custom headers for testing/dev
  if (req.headers['x-user-id']) {
    return {
      userId: String(req.headers['x-user-id']),
      name: req.headers['x-user-name'] || 'Local User',
    };
  }

  if (!authHeader || typeof authHeader !== 'string') {
    return { userId: null, name: 'Guest' };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return { userId: null, name: 'Guest' };
  }

  const token = match[1];
  try {
    const decoded = jwt.decode(token) || {};
    const userId = decoded.id || decoded._id || decoded.userId;
    const name = decoded.fullName || decoded.name || decoded.phoneNumber || 'User';
    if (userId) {
      return { userId: String(userId), name: String(name) };
    }
  } catch (err) {
    console.warn('[auth] Failed to decode Authorization token:', err.message);
  }

  return { userId: null, name: 'Guest' };
}

// ---------------------------------------------------------------------------
// Main Initialization Function
// ---------------------------------------------------------------------------

/**
 * Initializes DeskLink logic on the shared Express app and Socket.IO instance.
 * @param {express.Application} app 
 * @param {http.Server} server 
 * @param {socket.io.Server} io 
 */
function initDesklink(app, server, io) {
  console.log('[DeskLink] Initializing module...');
  ioInstance = io;

  // ---------------------------------------------------------------------------
  // REST API Routes
  // ---------------------------------------------------------------------------

  // Health check specific to desklink
  app.get('/health/desklink', (req, res) => {
    res.json({ status: 'ok', scope: 'desklink-module', timestamp: new Date().toISOString() });
  });

  // POST /api/remote/meeting-request
  app.post('/api/remote/meeting-request', async (req, res) => {
    const { userId, name } = getAuthContextFromReq(req);
    const { toUserId, meetingId } = req.body || {};

    console.log(`[desklink] meeting-request: From ${userId} (${name}) -> To ${toUserId} (Meeting: ${meetingId})`);

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });
    if (!toUserId) return res.status(400).json({ message: 'toUserId is required' });
    if (!meetingId) return res.status(400).json({ message: 'meetingId is required' });

    // 1. Validate Meeting Membership
    const participants = getMeetingParticipants(meetingId);
    if (!participants.includes(userId) || !participants.includes(toUserId)) {
      return res.status(403).json({ message: 'Both users must be in the specified meeting' });
    }

    const sessionId = generateSessionId();

    // 2. Refresh target device (optional but good for debugging)
    // We don't necessarily select the device HERE, we let the target user's agent confirm availability.
    // But we need to know if they have ANY online device?
    // Let's settle on: The REQUEST goes to the User. The User + Agent approves it.

    // 3. Create Session in DB (Pending)
    const session = await RemoteSession.create({
      sessionId,
      callerUserId: userId,
      receiverUserId: toUserId,
      callerDeviceId: `web-${userId}`, // Viewer is usually web
      status: 'pending',
      meta: { meetingId }
    });

    const payload = {
      sessionId,
      meetingId,
      fromUserId: String(userId),
      callerName: name,
    };

    console.log(`[desklink] emitting request events to target user ${toUserId}`);
    // Emit to frontend (for UI notification) AND agent (for system tray popup)
    emitToUser(String(toUserId), 'desklink-remote-request', payload);
    emitToUser(String(toUserId), 'remote-access-request', payload);

    return res.status(201).json({ session: { sessionId } });
  });

  // POST /api/remote/accept
  app.post('/api/remote/accept', async (req, res) => {
    const { userId } = getAuthContextFromReq(req);
    const { sessionId, receiverDeviceId, permissions } = req.body || {};

    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const session = await RemoteSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    // Validate ownership
    if (String(session.receiverUserId) !== String(userId)) {
      return res.status(403).json({ message: 'Not authorized to accept this session' });
    }

    if (session.status !== 'pending') {
      return res.status(400).json({ message: 'Session is not pending' });
    }

    // Resolve Receiver Device (Host)
    // Preference: 1. Specified in body (from Agent) 2. Auto-lookup online device
    let effectiveReceiverDeviceId = receiverDeviceId;
    if (!effectiveReceiverDeviceId) {
      const device = await Device.findOne({
        userId: userId,
        status: 'online',
        blocked: false
      }).sort({ lastOnline: -1 });
      if (device) effectiveReceiverDeviceId = device.deviceId;
    }

    if (!effectiveReceiverDeviceId) {
      // Strict: Fail if no device to control
      // return res.status(400).json({ message: 'No active device found to host session' });
      // Lenient (dev):
      effectiveReceiverDeviceId = `agent-${userId}`;
    }

    // Update Session
    session.status = 'accepted';
    session.receiverDeviceId = effectiveReceiverDeviceId;
    session.startedAt = new Date();
    // Merge permissions
    if (permissions) {
      session.permissions = { ...session.permissions, ...permissions };
    }

    // Generate Tokens/metadata
    // Use the utility that creates JWTs valid for socketManager verification
    const callerToken = generateSessionToken(
      sessionId,
      session.callerUserId,
      session.callerDeviceId || `web-${session.callerUserId}`
    );

    const receiverToken = generateSessionToken(
      sessionId,
      session.receiverUserId,
      session.receiverDeviceId
    );

    // Persist token for signaling validation? 
    // Simplified: we won't store ephemeral tokens in DB for now, just session status is enough source of truth.

    await session.save();

    const sessionMetadata = {
      sessionId: session.sessionId,
      callerDeviceId: session.callerDeviceId,
      receiverDeviceId: session.receiverDeviceId,
      permissions: session.permissions,
    };

    // Notify Viewer (Caller)
    emitToUser(session.callerUserId, 'desklink-session-start', {
      ...sessionMetadata,
      token: callerToken,
      role: 'caller',
    });
    emitToUser(session.callerUserId, 'remote-access-approved', {
      ...sessionMetadata
    });

    // Notify Host (Receiver Agent + Frontend)
    emitToDevice(session.receiverDeviceId, 'desklink-session-start', {
      ...sessionMetadata,
      token: receiverToken,
      role: 'receiver',
    });
    // Also notify receiver frontend to close modal
    emitToUser(session.receiverUserId, 'remote-access-accepted', {
      sessionId
    });

    console.log('[desklink] accepted session', sessionId);

    return res.json({ session, callerToken, receiverToken });
  });

  // POST /api/remote/reject
  app.post('/api/remote/reject', async (req, res) => {
    const { userId } = getAuthContextFromReq(req);
    const { sessionId } = req.body || {};

    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const session = await RemoteSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    if (String(session.receiverUserId) !== String(userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.status = 'rejected';
    session.endedAt = new Date();
    await session.save();

    emitToUser(session.callerUserId, 'remote-access-rejected', {
      sessionId: session.sessionId,
    });

    return res.json({ session });
  });

  // POST /api/remote/complete
  app.post(['/api/remote/complete', '/api/remote/session/:id/complete'], async (req, res) => {
    const { userId } = getAuthContextFromReq(req);
    const paramId = req.params && req.params.id;
    const bodyId = req.body && req.body.sessionId;
    const sessionId = paramId || bodyId;

    if (!sessionId) return res.status(400).json({ message: 'sessionId is required' });

    const session = await RemoteSession.findOne({ sessionId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    // Allow either party to end
    if (String(session.callerUserId) !== String(userId) && String(session.receiverUserId) !== String(userId)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();

    const endPayload = { sessionId: session.sessionId, status: 'ended' };

    emitToUser(session.callerUserId, 'desklink-remote-response', endPayload);
    emitToUser(session.receiverUserId, 'desklink-remote-response', endPayload);

    // Also explicitly notify WebRTC components to stop
    if (session.callerUserId) emitToUser(session.callerUserId, 'webrtc-cancel', endPayload);
    if (session.receiverUserId) emitToUser(session.receiverUserId, 'webrtc-cancel', endPayload);
    if (session.receiverDeviceId) emitToDevice(session.receiverDeviceId, 'webrtc-cancel', endPayload);

    console.log('[desklink] ended session', sessionId);

    return res.json({ session });
  });

  console.log('[DeskLink] Module initialized successfully.');
}

module.exports = initDesklink;
