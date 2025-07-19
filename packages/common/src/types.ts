import { z } from "zod";

export const CreateUserSchema = z.object({
  email: z.string(),
  password: z.string().min(6).max(12),
  name: z.string(),
});

export const SigninSchema = z.object({
  email: z.string(),
  password: z.string().min(6).max(12),
});

export const CreateRoomSchema = z.object({
  RoomName: z.string(),
});
