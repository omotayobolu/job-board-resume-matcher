const jwt = require("jsonwebtoken");
const { CustomError, HttpStatusCode } = require("../utils/error-handler");
const pool = require("../db");

async function authenticateToken(req, res, next) {
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userResult = await pool.query(
      "SELECT id, email, full_name, role FROM users WHERE id = $1",
      [decoded.id]
    );

    if (userResult.rows.length === 0) {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "User not found.",
        true
      );
    }
    req.user = userResult.rows[0];
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
