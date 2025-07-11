const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middlewares/authMiddleware");
const { HttpStatusCode } = require("../utils/error-handler");
const pool = require("../db");

router.get("/check", authenticateToken, async (req, res, next) => {
  try {
    const email = req.user.email;
    if (!email) {
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ message: "Email is required" });
    }

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res
        .status(HttpStatusCode.NOT_FOUND)
        .json({ message: "User not found" });
    }

    const updatedUser = userResult.rows[0];

    res.status(HttpStatusCode.OK).json({
      message: "Authenticated",
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
