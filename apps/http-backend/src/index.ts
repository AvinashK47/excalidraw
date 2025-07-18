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

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.post("/signup", (req, res) => {
  const parsedData = CreateUserSchema.safeParse(req.body);
  if (!parsedData.success) {
    return res.json({ message: "Incorrect Inputs" });
  } else {
    prismaClient.user.create({
      data: {
        email: parsedData.data.email,
        password: parsedData.data.password,
        name: parsedData.data.name,
      },
    });
  }
});

app.post("/signin", middleware, (req, res) => {
  const data = SigninSchema.safeParse(req.body);
  if (!data.success) {
    return res.json({ message: "Incorrect Inputs" });
  }
  // const userId = prismaClient.user;
  // const token = jwt.sign({ userId }, JWT_SECRET);
  // res.json(token);
});

app.post("/create-room", middleware, (req, res) => {
  const data = CreateRoomSchema.safeParse(req.body);
  if (!data.success) {
    return res.json({ message: "Incorrect Inputs" });
  }
});

app.listen(3000, () => {
  console.log("http-server running at port : 3000");
});
