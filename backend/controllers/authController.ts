import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import pool from "../db";
import { requiredEnv } from "../env";
import { loginSchema, registerSchema } from "../schemas";
import type { User } from "../types/domain";
import { hashPassword, verifyPassword } from "../utils/password";

interface AuthUser extends User {
  password_hash: string | null;
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

const publicUser = (user: User): User => ({
  id: user.id,
  email: user.email,
  full_name: user.full_name,
  role: user.role,
  hasprofile: user.hasprofile,
});

function setAuthCookie(res: Response, user: User): void {
  const token = jwt.sign(
    { id: user.id, auth_method: "password" },
    requiredEnv("JWT_SECRET"),
    { expiresIn: "7d" }
  );
  res.cookie("token", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, full_name, password, role } = registerSchema.parse(req.body as unknown);
    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1",
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query<User>(
      `INSERT INTO users (email, full_name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, full_name, role, hasprofile`,
      [email, full_name, passwordHash, role]
    );
    const saved = result.rows[0];
    if (!saved) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }
    const user = publicUser(saved);
    setAuthCookie(res, user);
    return res.status(201).json({ message: "Account created", user });
  } catch (error) {
    next(error);
  }
}

async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = loginSchema.parse(req.body as unknown);
    const result = await pool.query<AuthUser>(
      `SELECT id, email, full_name, role, hasprofile, password_hash
       FROM users WHERE lower(email) = $1 LIMIT 1`,
      [email]
    );
    const user = result.rows[0];
    const matches = await verifyPassword(password, user?.password_hash);
    if (!user || !matches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const safeUser = publicUser(user);
    setAuthCookie(res, safeUser);
    return res.status(200).json({ message: "Logged in", user: safeUser });
  } catch (error) {
    next(error);
  }
}

function logout(_req: Request, res: Response) {
  res.clearCookie("token", cookieOptions);
  res.status(200).json({ message: "Logged out" });
}

function getCurrentUser(req: Request, res: Response) {
  res.status(200).json({ message: "Authenticated", user: publicUser(req.user) });
}

export { register, login, logout, getCurrentUser };
