import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { JWT_SECRET } from "./config";
import { middleware } from "./middleware";

const app = express();

dotenv.config();

app.get("/", (req, res) => {
  res.send("Hello world");
});

app.post("/signup", (req, res) => {});

app.post("/signin", middleware, async (req, res) => {
  const userId = 1;
  const token = await jwt.sign({ userId }, JWT_SECRET);
  res.json(token);
});

app.post("/create-room",middleware, (req, res) => {
  
})

app.listen(3000, () => {
  console.log("http-server running at port : 3000");
});
