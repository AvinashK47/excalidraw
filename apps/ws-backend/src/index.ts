import WebSocket, { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";
import { prismaClient } from "@repo/db/index";

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
    console.log(e);
    return null;
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

  const existingUser = users.find((x) => x.userId === userId);
  if (existingUser) {
    existingUser.ws = ws;
  } else {
    users.push({
      ws: ws,
      rooms: [],
      userId: userId,
    });
  }

  ws.on("message", async function message(data) {
    const parsedData = JSON.parse(data as unknown as string);

    console.log("parsed data  : \n", parsedData); // {type : "join_room"|"leave_room",roomId:"room"}

    if (parsedData.type === "join_room") {
      const user = users.find((x) => x.ws === ws);
      const roomID = parsedData.roomId;
      console.log("JOining room : ", roomID, "type of  : ", typeof roomID);
      if (user) {
        user.rooms.push(roomID);
        ws.send(JSON.stringify({ message: "room created" }));
      }
    }
    if (parsedData.type === "leave_room") {
      const user = users.find((x) => x.ws === ws);
      if (!user) {
        return;
      }
      user.rooms = user?.rooms.filter((x) => x === parsedData.room);
    }

    try {
      if (parsedData.type === "chat") {
        const roomId = Number(parsedData.name);
        const message = parsedData.message;

        console.log(parsedData);

        const chat = await prismaClient.chat.create({
          data: {
            roomId: roomId,
            message: message,
            userId: userId,
          },
        });
        if (chat) {
          console.log("entry should be done");
        }

        console.log(typeof roomId, typeof message, typeof userId);

        users.forEach((user) => {
          if (user.rooms.includes(roomId.toString())) {
            user.ws.send(
              JSON.stringify({
                type: "chat_message",
                message: message,
                roomId: roomId,
              })
            );
          }
        });
        console.log(users);
      }
    } catch (e) {
      console.log("error : ", e);
    }
  });
});
