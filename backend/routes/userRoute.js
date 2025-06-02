const express = require("express");
const { updateUserRole, getUser } = require("../controllers/userController");
const authenticateToken = require("../middlewares/authMiddleware");
const router = express.Router();

router.get("/", authenticateToken, getUser);
router.patch("/update-role", updateUserRole);

module.exports = router;
