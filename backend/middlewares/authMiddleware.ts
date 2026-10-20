import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { CustomError, HttpStatusCode } from "../utils/error-handler";
import pool from "../db";
import { requiredEnv } from "../env";
import type { User } from "../types/domain";

const tokenPayloadSchema = z.object({
  id: z.string().uuid(),
  auth_method: z.literal("password"),
});

async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const token: unknown = req.cookies?.token;
  if (typeof token !== "string") {
    return next(new CustomError(
      "UNAUTHORIZED",
      HttpStatusCode.UNAUTHORIZED,
      "Access denied. No token provided.",
      true
    ));
  }

  let userId: string;
  try {
    const decoded = jwt.verify(token, requiredEnv("JWT_SECRET"));
    userId = tokenPayloadSchema.parse(decoded).id;
  } catch (error) {
    return next(new CustomError(
      "UNAUTHORIZED",
      HttpStatusCode.UNAUTHORIZED,
      "Invalid token.",
      true
    ));
  }

  try {
    const userResult = await pool.query<User>(
      "SELECT id, email, full_name, role, hasprofile FROM users WHERE id = $1 AND password_hash IS NOT NULL",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return next(new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "User not found.",
        true
      ));
    }
    req.user = userResult.rows[0]!;
    next();
  } catch (error) {
    next(error);
  }
}

function isRecruiter(req: Request, res: Response, next: NextFunction) {
  if (req.user.role !== "recruiter") {
    throw new CustomError(
      "FORBIDDEN",
      HttpStatusCode.FORBIDDEN,
      "Access denied. Only recruiters can perform this action.",
      true
    );
  }
  next();
}

export { authenticateToken,isRecruiter };
