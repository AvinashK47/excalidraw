import "dotenv/config";
import WebSocket, { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/index";

const PORT = Number(process.env.PORT) || 8000;
const wss = new WebSocketServer({ port: PORT });
console.log(`WebSocket server running on port: ${PORT}`);

// Ensure a fallback guest user exists for zero-friction collaborative sessions
let GUEST_USER_ID = "guest-collaborator-id";
async function initGuestUser() {
  try {
    const guest = await prismaClient.user.upsert({
      where: { email: "guest@excalidraw.local" },
      update: {},
      create: {
        id: GUEST_USER_ID,
        email: "guest@excalidraw.local",
        password: "guest_dummy_password_hash",
        name: "Guest Collaborator",
      },
    });
    GUEST_USER_ID = guest.id;
  } catch (err) {
    console.warn("Could not upsert guest user:", err);
  }
}
initGuestUser();

// Helper to ensure room exists before writing chats to prevent foreign key errors
async function ensureRoomExists(roomId: number, slugHint?: string) {
  try {
    const existing = await prismaClient.room.findUnique({
      where: { id: roomId },
    });
    if (existing) return existing;

    const guest = await prismaClient.user.upsert({
      where: { email: "guest@excalidraw.local" },
      update: {},
      create: {
        id: GUEST_USER_ID,
        email: "guest@excalidraw.local",
        password: "guest_dummy_password_hash",
        name: "Guest Collaborator",
      },
    });

    const slug = slugHint || `room-${roomId}-${Date.now()}`;
    return await prismaClient.room.create({
      data: {
        id: roomId,
        slug,
        adminId: guest.id,
      },
    });
  } catch (err) {
    console.warn(`ensureRoomExists error for room ${roomId}:`, err);
    return null;
  }
}

// In-memory write-through shape cache per room
const roomShapesCache = new Map<number, any[]>();

function checkUser(token: string): string | null {
  if (!token || token === "guest") {
    return GUEST_USER_ID;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    if (typeof decoded === "object" && decoded?.userId) {
      return decoded.userId;
    }
    return GUEST_USER_ID;
  } catch {
    return GUEST_USER_ID;
  }
}

interface ConnectedUser {
  ws: WebSocket;
  rooms: string[];
  userId: string;
  name?: string;
}

const connectedUsers: ConnectedUser[] = [];

wss.on("connection", (ws: WebSocket, request: any) => {
  const url = request.url || "";
  const queryIndex = url.indexOf("?");
  const queryParams = new URLSearchParams(queryIndex !== -1 ? url.substring(queryIndex + 1) : "");
  const token = queryParams.get("token") || "guest";
  const userName = queryParams.get("name") || "Collaborator";
  const userId = checkUser(token) || GUEST_USER_ID;

  const currentUser: ConnectedUser = {
    ws,
    rooms: [],
    userId,
    name: userName,
  };
  connectedUsers.push(currentUser);

  ws.on("message", async function message(rawData) {
    try {
      const parsedData = JSON.parse(rawData.toString());

      // 1. Join Room
      if (parsedData.type === "join_room") {
        const roomIdStr = String(parsedData.roomId);
        const numericRoomId = Number(parsedData.roomId);
        if (!currentUser.rooms.includes(roomIdStr)) {
          currentUser.rooms.push(roomIdStr);
        }

        // Ensure room exists in DB
        if (!isNaN(numericRoomId)) {
          await ensureRoomExists(numericRoomId, parsedData.slug);

          // Populate cache from DB if not loaded yet
          if (!roomShapesCache.has(numericRoomId)) {
            try {
              const chats = await prismaClient.chat.findMany({
                where: { roomId: numericRoomId },
                orderBy: { id: "asc" },
                take: 1000,
              });
              const shapes: any[] = [];
              for (const c of chats) {
                try {
                  const s = JSON.parse(c.message);
                  if (s && s.id) shapes.push(s);
                } catch {
                  // Ignore
                }
              }
              roomShapesCache.set(numericRoomId, shapes);
            } catch (err) {
              console.warn("Could not populate room shapes cache:", err);
            }
          }

          // Instantly send full room shape history to the newly connected peer
          const shapes = roomShapesCache.get(numericRoomId) || [];
          ws.send(
            JSON.stringify({
              type: "init_shapes",
              roomId: numericRoomId,
              shapes,
            })
          );
        }

        ws.send(JSON.stringify({ type: "room_joined", roomId: roomIdStr }));

        // Notify room of new peer
        connectedUsers.forEach((u) => {
          if (u.ws !== ws && u.rooms.includes(roomIdStr) && u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(
              JSON.stringify({
                type: "user_joined",
                roomId: roomIdStr,
                userId: currentUser.userId,
                name: currentUser.name,
              })
            );
          }
        });
        return;
      }

      // 2. Leave Room
      if (parsedData.type === "leave_room") {
        const roomIdStr = String(parsedData.roomId);
        currentUser.rooms = currentUser.rooms.filter((r) => r !== roomIdStr);
        return;
      }

      // 3. Canvas Drawing Event / Shape Mutation
      if (parsedData.type === "chat" || parsedData.type === "draw") {
        const roomId = Number(parsedData.roomId);
        const shapeMessage =
          typeof parsedData.message === "string"
            ? parsedData.message
            : JSON.stringify(parsedData.message);

        // Update in-memory shape cache immediately
        try {
          const shapeObj = JSON.parse(shapeMessage);
          if (shapeObj && shapeObj.id) {
            const cached = roomShapesCache.get(roomId) || [];
            const existingIdx = cached.findIndex((s) => s.id === shapeObj.id);
            if (existingIdx !== -1) {
              cached[existingIdx] = shapeObj;
            } else {
              cached.push(shapeObj);
            }
            roomShapesCache.set(roomId, cached);
          }
        } catch {
          // Ignore
        }

        // Persist to PostgreSQL safely
        ensureRoomExists(roomId).then(() => {
          prismaClient.chat
            .create({
              data: {
                roomId: roomId,
                message: shapeMessage,
                userId: currentUser.userId,
              },
            })
            .catch((err: unknown) => console.error("Prisma chat save error:", err));
        });

        // Real-time broadcast to all other peers in the room
        const payload = JSON.stringify({
          type: "chat_message",
          message: shapeMessage,
          roomId: roomId,
          userId: currentUser.userId,
        });

        connectedUsers.forEach((u) => {
          if (u.ws !== ws && u.rooms.includes(String(roomId)) && u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(payload);
          }
        });
        return;
      }

      // 4. Live Multi-Cursor Presence
      if (parsedData.type === "cursor") {
        const roomIdStr = String(parsedData.roomId);
        const cursorPayload = JSON.stringify({
          type: "cursor_presence",
          roomId: roomIdStr,
          userId: currentUser.userId,
          name: currentUser.name,
          x: parsedData.x,
          y: parsedData.y,
        });

        connectedUsers.forEach((u) => {
          if (u.ws !== ws && u.rooms.includes(roomIdStr) && u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(cursorPayload);
          }
        });
        return;
      }

      // 5. Clear Canvas Event
      if (parsedData.type === "clear_canvas") {
        const roomIdStr = String(parsedData.roomId);
        const numericRoomId = Number(parsedData.roomId);

        // Clear in-memory cache
        roomShapesCache.set(numericRoomId, []);

        // Clear from PostgreSQL
        prismaClient.chat
          .deleteMany({
            where: { roomId: numericRoomId },
          })
          .catch((err) => console.error("Failed to delete chats on clear:", err));

        // Broadcast to all peers
        connectedUsers.forEach((u) => {
          if (u.ws !== ws && u.rooms.includes(roomIdStr) && u.ws.readyState === WebSocket.OPEN) {
            u.ws.send(JSON.stringify({ type: "canvas_cleared", roomId: roomIdStr }));
          }
        });
        return;
      }
    } catch (e) {
      console.error("WS message processing error:", e);
    }
  });

  ws.on("close", () => {
    const idx = connectedUsers.indexOf(currentUser);
    if (idx !== -1) {
      connectedUsers.splice(idx, 1);
    }
  });
});
