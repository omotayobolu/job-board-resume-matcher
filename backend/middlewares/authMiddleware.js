const jwt = require("jsonwebtoken");
const { CustomError, HttpStatusCode } = require("../utils/error-handler");

function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    throw new CustomError(
      "UNAUTHORIZED",
      HttpStatusCode.UNAUTHORIZED,
      "Access denied. No token provided.",
      true
    );
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (error) {
    throw new CustomError(
      "UNAUTHORIZED",
      HttpStatusCode.UNAUTHORIZED,
      "Invalid token.",
      true
    );
  }
}

function isRecruiter(req, res, next) {
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

module.exports = { authenticateToken, isRecruiter };
