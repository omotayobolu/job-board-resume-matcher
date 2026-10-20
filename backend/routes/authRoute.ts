import express from "express";
const router = express.Router();
import { rateLimit } from "express-rate-limit";
import { authenticateToken } from "../middlewares/authMiddleware";
import { register, login, logout, getCurrentUser } from "../controllers/authController";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in 15 minutes." },
});

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/logout", logout);
router.get("/me", authenticateToken, getCurrentUser);

export default router;
