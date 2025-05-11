const { errorHandler } = require("../utils/error-handler");

function errorMiddleware(error, req, res, next) {
  errorHandler.handleError(error);

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

module.exports = errorMiddleware;
