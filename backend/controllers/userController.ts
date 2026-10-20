import type { Request, Response, NextFunction } from "express";
import { HttpStatusCode, CustomError } from "../utils/error-handler";
import pool from "../db";
import { roleSchema } from "../schemas";
import type { User } from "../types/domain";

const getUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;
    if (!userId) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "User ID is required",
        true
      );
    }

    const user = await pool.query<User & { created_at: Date }>("SELECT id, email, full_name, role, created_at, hasprofile FROM users WHERE id = $1", [
      userId,
    ]);
    if (user.rows.length === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User not found",
        true
      );
    }
    res.status(HttpStatusCode.OK).json({
      message: "User retrieved successfully",
      user: user.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const updateUserRole = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = roleSchema.parse(req.body as unknown);

    const result = await pool.query<{ id: string }>("UPDATE users SET role = $1 WHERE id = $2 RETURNING id", [
      role,
      req.user.id,
    ]);

    if (result.rowCount === 0) {
      throw new CustomError("NOT FOUND", HttpStatusCode.NOT_FOUND, "User not found", true);
    }

    res
      .status(HttpStatusCode.OK)
      .json({ message: "Role updated successfully" });
  } catch (error) {
    next(error);
  }
};

export { getUser,updateUserRole };
