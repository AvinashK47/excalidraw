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
    return res.json({ message: "Incorrect Inputs" });
  } else {
    try {
      const currentUser = await prismaClient.user.create({
        data: {
          email: parsedData.data.email,
          password: parsedData.data.password,
          name: parsedData.data.name,
        },
      });
      if (currentUser) {
        return res.json({ message: "User created" });
      } else {
        return res.status(411).json({ message: "User with this email already exists" });
      }
    } catch (err) {
      console.log("Error while creating a user :" + err);
    }
  }
});

app.post("/signin", async (req, res) => {
  const data = SigninSchema.safeParse(req.body);
  if (!data.success) {
    return res.json({ message: "Incorrect Inputs" });
  }
  const userId = await prismaClient.user.findFirst({
    where: {
      email: data.data.email,
      password: data.data.password,
    },
  });
  const token = jwt.sign({ userId }, JWT_SECRET);
  res.json({ token: token });
});

app.post("/create-room", middleware, async (req, res) => {
  const data = CreateRoomSchema.safeParse(req.body);
});

app.listen(3000, () => {
  console.log("http-server running at port : 3000");
});
