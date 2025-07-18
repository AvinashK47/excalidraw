import { NextFunction, Request, Response } from "express";
import jwt, { TokenExpiredError } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/backend-common/config";

export function middleware(req: Request, res: Response, next: NextFunction) {
  const token: PublicKeyCredentialJSON = req.headers["authorization"];

  const decoded = jwt.verify(token, JWT_SECRET);
  // @ts-ignore
  if (decoded.userId) {
    //@ts-ignore
    req.userId = decoded.userId;
    next();
  } else {
    res.status(403).json({ message: "Unauthorized" });
  }
}
