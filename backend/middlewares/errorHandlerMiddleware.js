const { errorHandler } = require("../utils/error-handler");

function errorMiddleware(error, req, res, next) {
  errorHandler.handleError(error);

  if (errorHandler.isTrustedError(error)) {
    res.status(error.statusCode || 500).json({
      error: error.message || "Something went wrong!",
    });
  } else {
    res.status(500).json({
      error: "Internal server error",
    });
  }

  next();
}

module.exports = errorMiddleware;
