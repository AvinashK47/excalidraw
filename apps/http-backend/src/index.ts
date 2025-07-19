import express from "express";
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

const app = express();

dotenv.config();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Root page");
});

app.post("/signup", async (req, res) => {
  console.log(req.body);
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
    return res.json({ message: "Incorrect Inputs" });
  }

  const currentUser = await prismaClient.user.findUnique({
    where: {
      email: data.data.email,
    },
  });
  if (!currentUser) {
    return res.json("User doesnt exist / invalid email ");
  }
  const userId = currentUser.id;
  const result = await bcrypt.compare(data.data.password, currentUser.password);

  if (result == true) {
    const token = jwt.sign({ userId }, JWT_SECRET);
    return res.json({ token: token });
  } else {
    return res.json("Unauthorized");
  }
});

app.post("/room", middleware, async (req, res) => {
  const parsedData = CreateRoomSchema.safeParse(req.body);
  if (!parsedData.success) {
    console.error("Room creation validation error:", parsedData.error);
    return res.status(400).json({
      message: "Incorrect Inputs"
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
        slug: parsedData.data.RoomName,
        adminId: userId,
      },
    });
    return res.json({ roomId: room.id });
  } catch (err) {
    console.error("Error while creating a room:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(3000, () => {
  console.log("http-server running at port : 3000");
});
