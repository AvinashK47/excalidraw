import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { middleware } from "./middleware";
import { JWT_SECRET } from "@repo/backend-common/config";
import {
  CreateUserSchema,
  CreateRoomSchema,
  SigninSchema,
} from "@repo/common/types";
import { prismaClient } from "@repo/db/index";
import bcrypt from "bcrypt";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "excalidraw-http-backend" });
});

app.post("/signup", async (req, res) => {
  const parsedData = CreateUserSchema.safeParse(req.body);
  if (!parsedData.success) {
    return res.status(400).json({ message: "Incorrect Inputs" });
  }

  try {
    const existingUser = await prismaClient.user.findUnique({
      where: {
        email: parsedData.data.email,
      },
    });

    if (existingUser) {
      return res
        .status(409)
        .json({ message: "User with this email already exists" });
    }

    const hashedpasswd = await bcrypt.hash(parsedData.data.password, 7);
    const currentUser = await prismaClient.user.create({
      data: {
        email: parsedData.data.email,
        password: hashedpasswd,
        name: parsedData.data.name,
      },
    });

    return res.json({
      message: "User created",
      userId: currentUser.id,
    });
  } catch (err) {
    console.error("Error while creating a user:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/signin", async (req, res) => {
  const data = SigninSchema.safeParse(req.body);
  if (!data.success) {
    return res.status(400).json({ message: "Incorrect Inputs" });
  }

  try {
    const currentUser = await prismaClient.user.findUnique({
      where: {
        email: data.data.email,
      },
    });
    if (!currentUser) {
      return res.status(401).json({ message: "User does not exist / invalid email" });
    }
    const userId = currentUser.id;
    const result = await bcrypt.compare(data.data.password, currentUser.password);

    if (result === true) {
      const token = jwt.sign({ userId }, JWT_SECRET);
      return res.json({
        token: token,
        user: {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
        },
      });
    } else {
      return res.status(401).json({ message: "Unauthorized: Invalid credentials" });
    }
  } catch (err) {
    console.error("Signin error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/room", middleware, async (req, res) => {
  const parsedData = CreateRoomSchema.safeParse(req.body);
  if (!parsedData.success) {
    console.error("Room creation validation error:", parsedData.error);
    return res.status(400).json({
      message: "Incorrect Inputs",
    });
  }

  // @ts-ignore
  const userId = req.userId;
  if (!userId) {
    return res.status(500).json({ message: "User ID not found in request" });
  }

  try {
    const room = await prismaClient.room.create({
      data: {
        slug: parsedData.data.roomName,
        adminId: userId,
      },
    });
    return res.json({ message: "Room Created", roomId: room.id, slug: room.slug });
  } catch (err) {
    console.error("Error while creating a room:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/chats/:roomId", async (req, res) => {
  try {
    const roomId = Number(req.params.roomId);
    if (isNaN(roomId)) {
      return res.status(400).json({ message: "Invalid roomId parameter" });
    }

    const messages = await prismaClient.chat.findMany({
      where: {
        roomId: roomId,
      },
      orderBy: {
        id: "asc",
      },
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({ messages });
  } catch (err) {
    console.error("Error fetching chats:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/room/:slug", async (req, res) => {
  try {
    const slug = req.params.slug;
    const room = await prismaClient.room.findFirst({
      where: {
        slug,
      },
    });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    return res.json({
      room: room,
    });
  } catch (err) {
    console.error("Error fetching room:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`http-server running at port : ${PORT}`);
});
