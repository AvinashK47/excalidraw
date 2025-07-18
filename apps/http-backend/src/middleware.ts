import { NextFunction, Request, Response } from "express";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";

export function middleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];

  if (
    !authHeader ||
    typeof authHeader !== "string" ||
    !authHeader.startsWith("Bearer ")
  ) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // @ts-ignore
    if (decoded.userId) {
      //@ts-ignore
      req.userId = decoded.userId;
      next();
    } else {
      res.status(403).json({ message: "Unauthorized" });
    }
  } catch (error) {
    console.error("JWT verification error:", error);
    return res.status(403).json({ message: "Unauthorized" });
  }
}
