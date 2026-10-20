import type { Request, Response, NextFunction } from "express";
import { errorHandler } from "../utils/error-handler";
import { MulterError } from "multer";
import { ZodError } from "zod";

function errorMiddleware(error: unknown, _req: Request, res: Response, next: NextFunction) {
  errorHandler.handleError(error);

  if (res.headersSent) {
    return next(error);
  }

  if (error instanceof ZodError) {
    return res.status(400).json({ error: "Invalid request data.", details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) });
  }
  if (error && typeof error === "object" && "type" in error && error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body." });
  }
  if (error && typeof error === "object" && "type" in error && error.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body is too large." });
  }
  if (error instanceof MulterError) {
    return res.status(400).json({ error: "Invalid file upload." });
  }

  if (errorHandler.isTrustedError(error)) {
    return res.status(error.httpCode || 500).json({
      error: error.message || "Something went wrong!",
    });
  } else {
    return res.status(500).json({
      error: "Internal server error",
    });
  }
}

export default errorMiddleware;
