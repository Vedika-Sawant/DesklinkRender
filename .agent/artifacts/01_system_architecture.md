# Remote Access System Architecture
## VisionDesk2 - DeskLink Feature

---

## 1. Three-Component Architecture

```
[Frontend Web App] ←→ [Backend Server] ←→ [Desktop Agent]
(React + Vite)        (Node.js)          (.NET EXE)

• Login UI            • Authentication    • Device ID Gen
• Meeting UI          • Device Mapping    • Status Ping
• Access Requests     • Permissions       • Screen Capture
• Stores JWT          • WebSocket Hub     • Input Control
```

**Core Principle:** Frontend NEVER talks to Agent directly. All communication flows through Backend.

---

## 2. Data Models

### Device Model (NEW)
```javascript
{
  deviceId: String (unique),    // e.g., "DESK-A1B2C3D4"
  userId: ObjectId,             // Owner of device
  deviceName: String,           // e.g., "John's Laptop"
  status: 'online' | 'offline',
  lastSeen: Date,
  osInfo: String,
  createdAt: Date
}
```

### AccessRequest Model (NEW)
```javascript
{
  meetingId: String,
  requesterId: ObjectId,        // User A wants access
  requesterDeviceId: String,
  targetId: ObjectId,           // User B being accessed
  targetDeviceId: String,
  status: 'pending' | 'approved' | 'denied' | 'ended',
  requestedAt: Date,
  respondedAt: Date
}
```

### Meeting Model (Enhanced)
```javascript
{
  meetingId: String,
  participants: [
    {
      userId: ObjectId,
      deviceId: String,         // NEW: Track device in meeting
      socketId: String
    }
  ],
  status: 'active' | 'ended'
}
```

---

## 3. Component Responsibilities

### Frontend
✅ User authentication (login/register)  
✅ Display meetings and participants  
✅ Show device online/offline status  
✅ Send access requests  
✅ Display incoming access requests  
✅ Render remote screen  

❌ Generate Device IDs  
❌ Direct agent communication  
❌ Screen capture  

### Backend
✅ User authentication (JWT)  
✅ Device registration & mapping  
✅ Device status tracking  
✅ Meeting management  
✅ Access request handling  
✅ Permission enforcement  
✅ WebRTC signaling relay  
✅ Socket.IO event routing  

### DeskLink Agent
✅ Generate unique Device ID  
✅ Authenticate with backend  
✅ Register device with backend  
✅ Send heartbeat every 30s  
✅ Listen for access requests  
✅ Capture screen when approved  
✅ Stream via WebRTC  
✅ Inject input events  

❌ User management  
❌ Meeting logic  
❌ Permission decisions  

---

## 4. Key Workflows

### Workflow 1: Device Linking
1. User logs in → Frontend gets JWT
2. User downloads Agent from `/downloads/agent.exe`
3. Agent runs → generates unique Device ID
4. Agent calls `POST /device/register` with JWT + Device ID
5. Backend validates JWT → maps User ↔ Device
6. Agent starts heartbeat (POST /device/heartbeat every 30s)
7. Frontend displays "Device Online" ✓

### Workflow 2: Access Request
1. Meeting is active with Users A and B
2. User A clicks "Request Access to B's PC"
3. Frontend calls `POST /access/request` { targetUserId: B }
4. Backend validates:
   - A and B are in same meeting? ✓
   - B's device is online? ✓
5. Backend creates AccessRequest (status: pending)
6. Backend sends Socket.IO event to User B and Agent B
7. Agent B shows permission dialog
8. User B clicks "Allow"
9. Agent B calls `POST /access/respond` { action: 'approve' }
10. Backend updates status = 'approved'
11. Backend notifies User A via Socket.IO
12. WebRTC connection starts

### Workflow 3: Remote Session
1. Access approved → WebRTC established
2. Agent B captures screen (60 FPS) → streams to User A
3. User A sees remote screen in browser
4. User A moves mouse → sends input via Socket.IO
5. Backend forwards to Agent B
6. Agent B injects mouse movement on actual PC
7. Session continues until ended

---

## 5. Technology Stack

**Frontend:** React 18, Vite, Socket.IO Client, WebRTC  
**Backend:** Node.js, Express, MongoDB, Socket.IO, JWT  
**Agent:** .NET 6+, System.Drawing (screen capture), WindowsInput (input injection)

---

**Next:** See API Specifications, Implementation Plan
