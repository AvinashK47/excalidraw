import { z } from "zod";

export const CreateUserSchema = z.object({
  username: z.string(),
  email: z.string(),
  password: z.string().min(6).max(12),
  name: z.string(),
});

export const SigninSchema = z.object({
  username: z.string(),
  password: z.string().min(6).max(12),
});

export const CreateRoomSchema = z.object({
  name: z.string().min(6).max(8),
});
