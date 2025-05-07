const { logger } = require("./logger");

const HttpStatusCode = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER: 500,
};

class CustomError extends Error {
  constructor(status, httpCode, message, isOperational) {
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
    status,
    httpCode = this.HttpStatusCode.INTERNAL_SERVER,
    isOperational = false,
    message = "Internal Server Error"
  ) {
    super(status, httpCode, message, isOperational);
  }
}

class ErrorHandler {
  handleError(err) {
    logger.error("Error message: ", err);
  }

  isTrustedError(error) {
    if (error instanceof CustomError) {
      return error.isOperational;
    }
    return false;
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

module.exports = {
  HttpStatusCode,
  CustomError,
  APIError,
  errorHandler: new ErrorHandler(),
};
