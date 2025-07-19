import WebSocket, { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";

const wss = new WebSocketServer({ port: 8000 });
console.log("WSServer running on port 8000");

function CheckUser(token: string): string | null {
  try {
    const JWT_Token = token;
    const decoded = jwt.verify(JWT_Token, JWT_SECRET) as JwtPayload;

    if (typeof decoded == "string") {
      return null;
    }
    if (!decoded || !decoded.userId) {
      return null;
    }
    return decoded.userId;
  } catch (e) {
    return null;
    console.log(e);
  }
}

interface User {
  ws: WebSocket;
  rooms: string[];
  userId: string;
}

const users: User[] = [];

wss.on("connection", (ws: WebSocket, request: Request, res: Response) => {
  const url = request.url;
  if (!url) {
    return;
  }
  const queryParams = new URLSearchParams(url.split("?")[1]);
  const token = queryParams.get("token") || "";
  const userId = CheckUser(token);

  if (userId == null) {
    ws.close();
    return;
  }

  users.push({
    ws: ws,
    rooms: [],
    userId: userId,
  });

  ws.on("message", function message(data) {
    const parsedData = JSON.parse(data as unknown as string); // {type : "join_room"|"leave_room",roomId:"room"}
    if (parsedData.type === "join_room") {
      const user = users.find((x) => x.ws === ws);
      if (user) {
        user.rooms.push(parsedData.RoomName);
      }
    }
    if (parsedData.type === "leave_room") {
      const user = users.find((x) => x.ws === ws);
      if (!user) {
        return;
      }
      user.rooms = user?.rooms.filter((x) => x === parsedData.room);
    }

    if (parsedData.type === "chat") {
      const roomId = parsedData.RoomName;
      const message = parsedData.message;

      users.forEach((user) => {
        if (user.rooms.includes(roomId)) {
          user.ws.send(JSON.stringify(message));
        }
      });
    }
  });
});
