import WebSocket, { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "./config";

const wss = new WebSocketServer({ port: 8000 });

wss.on("connection", (ws:WebSocket, request :Request,res:Response) => {
  const url = request.url;
  if (!url) {
    return;
  }

  const queryParams = new URLSearchParams(url.split("?")[1]);
  //@ts-ignore
  const token = queryParams.get("token") || "";
  //@ts-ignore
  const decoded: JwtPayload = jwt.verify(token, JWT_SECRET);

  if (!decoded || !decoded.userId) {
    ws.close();
    res.json()
    return;
  }

  ws.on("message", () => {
    ws.send("pong");
  });
});
