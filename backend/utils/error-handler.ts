import { logger } from "./logger";

const HttpStatusCode = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER: 500,
};

class CustomError extends Error {
  readonly status: string;
  readonly httpCode: number;
  readonly isOperational: boolean;

  constructor(
    status: string,
    httpCode: number,
    message: string,
    isOperational = true,
  ) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);

    this.status = status;
    this.httpCode = httpCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this);
  }
}

class APIError extends CustomError {
  constructor(
    status: string,
    httpCode = HttpStatusCode.INTERNAL_SERVER,
    isOperational = false,
    message = "Internal Server Error",
  ) {
    super(status, httpCode, message, isOperational);
  }
}

class ErrorHandler {
  handleError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    const cause = error.cause instanceof Error ? error.cause.stack : undefined;
    logger.error(error.message, {
      stack: [error.stack, cause].filter(Boolean).join("\nCaused by: "),
    });
  }

  isTrustedError(error: unknown): error is CustomError {
    return error instanceof CustomError && error.isOperational === true;
  }
}

// function getErrorMessage(error) {
//   if (error instanceof Error) {
//     return error.message;
//   }
//   if (error && typeof error === "object" && "message" in error) {
//     return String(error.message);
//   }
//   if (typeof error === "string") {
//     return error;
//   }
//   return "An error occurred";
// }

const errorHandler = new ErrorHandler();
export { HttpStatusCode, CustomError, APIError, errorHandler };
