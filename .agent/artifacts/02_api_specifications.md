# API Specifications
## Remote Access Feature

---

## 1. Device Management APIs

### POST `/api/device/register`
Register agent device with backend

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Request:**
```json
{
  "deviceId": "DESK-A1B2C3D4E5F6",
  "deviceName": "John's Laptop",
  "osInfo": "Windows 11 Pro",
  "agentVersion": "1.0.0"
}
```

**Response (Success):**
```json
{
  "success": true,
  "device": {
    "id": "64f1a2b3c4d5e6f7g8h9i0j1",
    "deviceId": "DESK-A1B2C3D4E5F6",
    "userId": "user_id_from_jwt",
    "deviceName": "John's Laptop",
    "status": "online",
    "lastSeen": "2026-02-11T08:16:00Z"
  }
}
```

**Logic:**
1. Extract userId from JWT
2. Check if deviceId already exists for this user
3. If exists → update
4. If new → create new document
5. Set status = 'online', update lastSeen

---

### POST `/api/device/heartbeat`
Agent pings to maintain online status

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Request:**
```json
{
  "deviceId": "DESK-A1B2C3D4E5F6"
}
```

**Response:**
```json
{
  "success": true,
  "status": "online",
  "timestamp": "2026-02-11T08:16:30Z"
}
```

**Logic:**
1. Validate JWT
2. Find device by deviceId AND userId
3. Update lastSeen to current time
4. Keep status = 'online'

**Backend Background Task:**
- Every 60 seconds, check all devices
- If lastSeen > 90 seconds ago → set status = 'offline'
- Emit Socket.IO event 'device-status-changed'

---

### GET `/api/device/my-devices`
Get all devices for logged-in user

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Response:**
```json
{
  "success": true,
  "devices": [
    {
      "deviceId": "DESK-A1B2C3D4",
      "deviceName": "Main Desktop",
      "status": "online",
      "lastSeen": "2026-02-11T08:16:00Z"
    },
    {
      "deviceId": "DESK-X1Y2Z3A4",
      "deviceName": "Work Laptop",
      "status": "offline",
      "lastSeen": "2026-02-10T18:45:22Z"
    }
  ]
}
```

---

### GET `/api/device/status/:userId`
Get device status for another user (meeting context)

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Response:**
```json
{
  "success": true,
  "userId": "target_user_id",
  "devices": [
    {
      "deviceId": "DESK-B1C2D3",
      "deviceName": "Alice's PC",
      "status": "online"
    }
  ]
}
```

**Note:** Only return basic info (no sensitive data)

---

## 2. Meeting APIs (Enhanced)

### POST `/api/meeting/join`
Join meeting with device context

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Request:**
```json
{
  "meetingId": "meet_abc123",
  "deviceId": "DESK-A1B2C3D4"
}
```

**Response:**
```json
{
  "success": true,
  "meeting": {
    "meetingId": "meet_abc123",
    "participants": [
      {
        "userId": "user1",
        "name": "John",
        "deviceId": "DESK-A1B2C3D4",
        "deviceStatus": "online"
      },
      {
        "userId": "user2",
        "name": "Alice",
        "deviceId": "DESK-X1Y2Z3",
        "deviceStatus": "online"
      }
    ]
  }
}
```

**Logic:**
1. Validate user owns the deviceId
2. Add participant with userId + deviceId
3. Return full participant list with device statuses

---

### GET `/api/meeting/:meetingId/participants`
Get all participants with device info

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Response:**
```json
{
  "success": true,
  "participants": [
    {
      "userId": "user1",
      "name": "John Doe",
      "email": "john@example.com",
      "deviceId": "DESK-A1B2C3D4",
      "deviceStatus": "online",
      "deviceName": "John's Laptop"
    }
  ]
}
```

---

## 3. Access Request APIs

### POST `/api/access/request`
Request remote access to another user's PC

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Request:**
```json
{
  "meetingId": "meet_abc123",
  "targetUserId": "user2"
}
```

**Backend Validation:**
1. ✅ Requester is in the meeting
2. ✅ Target user is in the meeting
3. ✅ Target user has a device linked
4. ✅ Target device status = 'online'
5. ✅ No active access request already exists

**Response (Success):**
```json
{
  "success": true,
  "request": {
    "id": "req_xyz789",
    "meetingId": "meet_abc123",
    "requesterId": "user1",
    "targetId": "user2",
    "targetDeviceId": "DESK-X1Y2Z3",
    "status": "pending",
    "requestedAt": "2026-02-11T08:20:00Z"
  }
}
```

**Response (Validation Error):**
```json
{
  "success": false,
  "error": "Target user is not in the meeting"
}
```

**Backend Action:**
- Create AccessRequest document
- Emit Socket.IO event `access-request` to:
  - Target user's frontend (via socketId)
  - Target user's agent (via WebSocket/deviceId)

---

### POST `/api/access/respond`
Approve or deny access request

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Request:**
```json
{
  "requestId": "req_xyz789",
  "action": "approve"
}
```
(action: "approve" or "deny")

**Validation:**
1. ✅ Request exists
2. ✅ Current user is the target (not requester responding)
3. ✅ Request status is 'pending'

**Response:**
```json
{
  "success": true,
  "request": {
    "id": "req_xyz789",
    "status": "approved",
    "respondedAt": "2026-02-11T08:20:15Z"
  }
}
```

**Backend Action:**
- Update request status
- Emit Socket.IO event `access-response` to requester
- If approved → include targetDeviceId for WebRTC

---

### POST `/api/access/end`
End an active access session

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Request:**
```json
{
  "requestId": "req_xyz789"
}
```

**Validation:**
- User must be either requester OR target

**Response:**
```json
{
  "success": true,
  "message": "Access session ended"
}
```

**Backend Action:**
- Update status = 'ended'
- Emit `access-ended` to both parties
- Close WebRTC signaling

---

### GET `/api/access/active/:meetingId`
Get all active access sessions in meeting

**Headers:**  
`Authorization: Bearer <JWT_TOKEN>`

**Response:**
```json
{
  "success": true,
  "activeRequests": [
    {
      "id": "req_xyz789",
      "requesterId": "user1",
      "requesterName": "John",
      "targetId": "user2",
      "targetName": "Alice",
      "status": "approved",
      "startedAt": "2026-02-11T08:20:00Z"
    }
  ]
}
```

---

## 4. Socket.IO Events

### Device Status Events

**Event:** `device-status-changed`  
**Direction:** Backend → Frontend (broadcast to meeting participants)
```json
{
  "userId": "user2",
  "deviceId": "DESK-X1Y2Z3",
  "status": "online"
}
```

---

### Access Request Events

**Event:** `access-request`  
**Direction:** Backend → Target User (Frontend + Agent)
```json
{
  "requestId": "req_xyz789",
  "requesterId": "user1",
  "requesterName": "John Doe",
  "meetingId": "meet_abc123"
}
```

**Event:** `access-response`  
**Direction:** Backend → Requester
```json
{
  "requestId": "req_xyz789",
  "status": "approved",
  "targetDeviceId": "DESK-X1Y2Z3"
}
```

**Event:** `access-ended`  
**Direction:** Backend → Both parties
```json
{
  "requestId": "req_xyz789",
  "endedBy": "user2",
  "reason": "user_ended"
}
```

---

### WebRTC Signaling Events

**Event:** `webrtc-offer`  
**Direction:** Controller → Backend → Agent
```json
{
  "requestId": "req_xyz789",
  "from": "user1",
  "to": "user2_device",
  "offer": { /* SDP offer */ }
}
```

**Event:** `webrtc-answer`  
**Direction:** Agent → Backend → Controller
```json
{
  "requestId": "req_xyz789",
  "answer": { /* SDP answer */ }
}
```

**Event:** `webrtc-ice-candidate`  
**Direction:** Bidirectional
```json
{
  "requestId": "req_xyz789",
  "candidate": { /* ICE candidate */ }
}
```

---

### Remote Input Events

**Event:** `remote-input`  
**Direction:** Frontend → Backend → Agent
```json
{
  "requestId": "req_xyz789",
  "inputType": "mousemove",
  "data": { "x": 500, "y": 300 }
}
```

**Input Types:**
- `mousemove`: `{ x, y }`
- `mousedown`: `{ button: 'left'|'right'|'middle' }`
- `mouseup`: `{ button }`
- `keydown`: `{ key: 'A', keyCode: 65 }`
- `keyup`: `{ key, keyCode }`

---

## 5. Error Responses

All errors follow this format:
```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE_OPTIONAL"
}
```

**Common Error Codes:**
- `UNAUTHORIZED` - Invalid/missing JWT
- `DEVICE_NOT_FOUND` - Device not registered
- `DEVICE_OFFLINE` - Target device is offline
- `NOT_IN_MEETING` - User not in specified meeting
- `PERMISSION_DENIED` - Not authorized for this action
- `REQUEST_NOT_FOUND` - Access request doesn't exist
- `INVALID_STATUS` - Request in wrong state for this action

---

**Next:** Implementation Plan
