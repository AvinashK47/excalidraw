# TCS Prime (Premier Fresher Role) Interview & Architecture Guide
## Project: Real-Time Collaborative Whiteboard Infrastructure (Excalidraw Clone)

> **Honest Project Status for Interviewer:** This project is an active **Work In Progress (WIP)**. The core real-time infrastructure—Pub/Sub room broadcasting, JWT auth, HTTP REST APIs, and PostgreSQL database persistence—is fully built and running with text messages. I am currently transitioning the message payload to stream drawing strokes (coordinates, colors, stroke width, shape primitives) to power an HTML5 Canvas collaborative whiteboard.

---

## 1. 60-90 SECOND ELEVATOR PITCH (Easy Spoken Script)

> *"For my project, I built a **Real-Time Collaborative Whiteboard Infrastructure** inspired by Excalidraw, structured as a modern **Turborepo monorepo**.*
> 
> *To keep the architecture clean and performant, I split the backend into two services:
> 1. An **HTTP REST API (`apps/http-backend`)** built with Express for user signup/signin with `bcrypt` password hashing, JWT generation, and room management.
> 2. A dedicated **WebSocket Server (`apps/ws-backend`)** built with the native `ws` library for fast real-time broadcasting.*
> 
> *The core real-time layer uses an **In-Memory Pub/Sub engine**. When a user connects with a valid JWT token, they can join a room. Any message or drawing stroke sent to that room is immediately broadcast to all connected users in that room, while asynchronously saving to a **PostgreSQL database using Prisma ORM**.*
> 
> *To be transparent, it is currently a work in progress. The real-time Pub/Sub server, authentication, room creation, and PostgreSQL persistence are fully working with text chat. I am now updating the payload schema to send vector shape data (x/y points, stroke colors, thickness, font, boldness) so users can draw together live on an HTML5 Canvas."*

---

## 2. SIMPLE PEN-AND-PAPER ARCHITECTURE DIAGRAM & SCRIPT

### Pen-and-Paper ASCII Diagram

```text
+---------------------------------------------------------------------------------+
|                            FRONTEND (Next.js - apps/web)                        |
|                                                                                 |
|   User Mouse / Text Inputs  --->  Local Canvas / State  --->  WebSocket Client  |
+---------------------------------------------------------------------------------+
                                       |
                   +-------------------+-------------------+
                   | 1. HTTP Request (Auth/Rooms)          | 2. WS Connection (Real-Time)
                   v                                       v
+------------------------------------+   +----------------------------------------+
|      HTTP REST BACKEND (Port 3000)  |   |     WEBSOCKET BACKEND (Port 8000)      |
|    - POST /signup & /signin        |   |   - Authenticate JWT token             |
|    - POST /room (Auth Middleware)  |   |   - In-Memory Rooms (`users[]`)        |
|    - GET  /room/:slug              |   |   - Pub/Sub Room Broadcast Loop        |
+-----------------+------------------+   +-------------------+--------------------+
                  |                                          |
                  | Reads/Writes                             | Async Save
                  v                                          v
+---------------------------------------------------------------------------------+
|                       DATABASE LAYER (@repo/db - Prisma ORM)                     |
|                                                                                 |
|     PostgreSQL DB: User Model  <--->  Room Model  <--->  Chat/Stroke Model     |
+---------------------------------------------------------------------------------+
```

---

### What to Say While Drawing on Paper (4 Simple Steps)

1. **Draw the Frontend:** *"Here is the Next.js client (`apps/web`). It listens for user drawing or typing events and updates local state."*
2. **Draw the HTTP Backend:** *"I built an Express HTTP server (`apps/http-backend`) on port 3000 for signup, signin, and creating rooms. It uses `bcrypt` for password hashing and Zod for validation."*
3. **Draw the WebSocket Backend:** *"I built a separate WebSocket server (`apps/ws-backend`) on port 8000 using native `ws`. It verifies the JWT token on connection, tracks users in room arrays, and broadcasts events to everyone in the room."*
4. **Draw the Database:** *"At the bottom is PostgreSQL using Prisma ORM (`@repo/db`). When a message or stroke is broadcast, the WS server asynchronously saves it to PostgreSQL so past history can be fetched when a user re-joins."*

---

## 3. HAND-WRITABLE CORE LOGIC CODE SNIPPETS (Super Easy - Paper Test Ready)

These are bare-bones, minimal snippets. No edge-case bloat or complex checks—just pure core logic to write on paper in 20 seconds.

---

### Snippet 1: HTTP Backend Signup & Signin Routes (bcrypt + JWT)

```javascript
// Signup Route
app.post("/signup", async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 7);
  const user = await db.user.create({
    data: { email: req.body.email, password: hash, name: req.body.name }
  });
  res.json({ message: "User created", userId: user.id });
});

// Signin Route
app.post("/signin", async (req, res) => {
  const user = await db.user.findUnique({ where: { email: req.body.email } });
  const isValid = await bcrypt.compare(req.body.password, user.password);

  if (isValid) {
    const token = jwt.sign({ userId: user.id }, "SECRET");
    res.json({ token });
  } else {
    res.status(403).json({ message: "Invalid credentials" });
  }
});
```

---

### Snippet 2: Express Auth Middleware & Protected Room Route

```javascript
// Auth Middleware
function authMiddleware(req, res, next) {
  const token = req.headers.authorization.split(" ")[1];
  req.userId = jwt.verify(token, "SECRET").userId;
  next();
}

// Create Room Route
app.post("/room", authMiddleware, async (req, res) => {
  const room = await db.room.create({
    data: { slug: req.body.name, adminId: req.userId }
  });
  res.json({ roomId: room.id });
});
```

---

### Snippet 3: WebSocket Server Connection & JWT Auth

```javascript
const wss = new WebSocketServer({ port: 8000 });
const users = []; // { ws, rooms: [], userId }

wss.on("connection", (ws, req) => {
  const token = req.url.split("=")[1]; // Extract token from ?token=...
  const decoded = jwt.verify(token, "SECRET");

  users.push({ ws, rooms: [], userId: decoded.userId });
  ws.on("message", (data) => handleMessage(ws, data, decoded.userId));
});
```

---

### Snippet 4: Room Join & Pub/Sub Broadcast Engine Loop

```javascript
function handleMessage(ws, rawData, userId) {
  const { type, roomId, message } = JSON.parse(rawData);
  const user = users.find((u) => u.ws === ws);

  if (type === "join_room") user.rooms.push(roomId);

  if (type === "chat") {
    db.chat.create({ data: { roomId: Number(roomId), message, userId } }); // Async save
    
    users.filter((u) => u.rooms.includes(roomId)).forEach((u) => {
      u.ws.send(JSON.stringify({ type: "chat", message, roomId }));
    });
  }
}
```

---

### Snippet 5: Canvas Redraw Loop (Whiteboard Vector Renderer)

```javascript
function renderCanvas(canvas, shapes) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  shapes.forEach((s) => {
    ctx.strokeStyle = s.color || "black";
    if (s.type === "rect") ctx.strokeRect(s.x, s.y, s.w, s.h);
  });
}
```

---

## 4. CORE TECHNICAL MECHANICS (Simplified)

1. **WebSockets vs HTTP REST:**
   - **HTTP:** Good for one-off request/response (signup, login, create room).
   - **WebSockets:** Single persistent TCP connection. Great for real-time live events (chat/drawing) because it doesn't resend heavy HTTP headers every time.

2. **Text Chat to Collaborative Whiteboard Transition:**
   - The real-time Pub/Sub server engine does not change.
   - **Text Payload:** `{ type: "chat", roomId: "1", message: "Hello" }`
   - **Whiteboard Payload:** `{ type: "chat", roomId: "1", message: JSON.stringify({ type: "rect", x: 10, y: 20, w: 100, h: 50, color: "red" }) }`

3. **Security & Authentication:**
   - `bcrypt` hashes passwords before storing in PostgreSQL.
   - JWT tokens are verified in HTTP headers for REST endpoints, and in the URL query string (`?token=...`) during WebSocket connection setup.

4. **Database Persistence:**
   - PostgreSQL stores users, rooms, and chat/stroke history via Prisma ORM.
   - Saving to DB is asynchronous so it does not delay real-time broadcasting.

---

## 5. TOP 5 TECHNICAL INTERVIEW QUESTIONS & SIMPLE ANSWERS

### Q1: Why did you separate HTTP Backend and WebSocket Backend?
**Answer:** *"HTTP requests (like login or signup) are stateless and quick. WebSockets keep long-lived persistent connections open. Separating them prevents WebSocket connection memory from slowing down standard REST API calls."*

### Q2: How do you handle multiple users drawing at the same time?
**Answer:** *"Drawings are stored as an array of vector shape objects (not image pixels). When users draw simultaneously, new shapes are simply appended to the array. The server assigns timestamps so all users render shapes in the exact same layer order."*

### Q3: What happens if a user's internet disconnects for a few seconds?
**Answer:** *"When the internet reconnects, the WebSocket client reconnects using the JWT token and makes a quick HTTP GET request (`GET /room/:slug`) to fetch any missed messages or drawing shapes from PostgreSQL."*

### Q4: Why use a Monorepo with Turborepo?
**Answer:** *"Turborepo lets us keep frontend (`apps/web`), HTTP backend (`apps/http-backend`), WebSocket backend (`apps/ws-backend`), and DB schema (`packages/db`) in one repository. This makes sharing TypeScript types, Prisma clients, and configs super easy."*

### Q5: Why use WebSockets instead of Socket.io?
**Answer:** *"Native `ws` is lightweight, fast, has zero overhead, and gives complete transparent control over connection handshakes and JSON message broadcasting without unnecessary library bloat."*

---

## 6. TCS PRIME DEFENSE & CHEAT SHEET

| Question / Critique | Quick Winning Answer |
| :--- | :--- |
| **"Your app is still a text chat, not a whiteboard!"** | *"The Pub/Sub room broadcasting, JWT auth, and DB persistence are the core real-time infrastructure. Transitioning to a whiteboard is just changing the message string from text to a vector shape JSON object."* |
| **"Why pass JWT token in URL query parameter for WebSockets?"** | *"Browser `new WebSocket()` API doesn't support custom HTTP headers. Passing the token in the URL during the upgrade handshake is standard practice for WebSockets."* |
| **"Won't writing to PostgreSQL on every drawing move slow down the server?"** | *"We don't write every mouse pixel move to the database. We broadcast live moves to other clients immediately, and only save the final completed shape to PostgreSQL when the mouse is released."* |
| **"How do you handle users leaving abruptly without closing?"** | *"The WebSocket server listens to socket `close` events (`ws.on('close')`) and removes the disconnected user from the in-memory `users` array to prevent memory leaks."* |

---

## 7. FILE QUICK-REFERENCE MAP

- **WebSocket Server & Pub/Sub:** [`apps/ws-backend/src/index.ts`](file:///home/avinash/Code/excalidraw/apps/ws-backend/src/index.ts)
- **HTTP Express Server:** [`apps/http-backend/src/index.ts`](file:///home/avinash/Code/excalidraw/apps/http-backend/src/index.ts)
- **Auth Middleware:** [`apps/http-backend/src/middleware.ts`](file:///home/avinash/Code/excalidraw/apps/http-backend/src/middleware.ts)
- **Prisma DB Schema:** [`packages/db/prisma/schema.prisma`](file:///home/avinash/Code/excalidraw/packages/db/prisma/schema.prisma)
- **Zod Validation Schemas:** [`packages/common/src/types.ts`](file:///home/avinash/Code/excalidraw/packages/common/src/types.ts)
- **Next.js Frontend App:** [`apps/web/src/app/room/[slug]/page.tsx`](file:///home/avinash/Code/excalidraw/apps/web/src/app/room/%5Bslug%5D/page.tsx)
