const express = require("express");
const router = express.Router();
const authenticateToken = require("../middlewares/authMiddleware");

router.get("/check", authenticateToken, (req, res) => {
  res.status(200).json({
    message: "Authenticated",
    user: req.user,
  });
});

module.exports = router;
