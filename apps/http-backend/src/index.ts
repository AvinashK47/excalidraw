import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { middleware } from "./middleware";
import { JWT_SECRET } from "@repo/backend-common/config";
import { CreateUserSchema, CreateRoomSchema } from "@repo/common/types";

const app = express();

dotenv.config();

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.post("/signup", (req, res) => {
  const data = CreateUserSchema.safeParse(req.body);
  if (!data.success) {
    return res.json({ message: "Incorrect Inputs" });
  }
});

app.post("/signin", middleware, (req, res) => {
  const userId = 1;
  const token = jwt.sign({ userId }, JWT_SECRET);
  res.json(token);
});

app.post("/create-room", middleware, (req, res) => {});

app.listen(3000, () => {
  console.log("http-server running at port : 3000");
});
