import express from "express";
import { updateUserRole, getUser } from "../controllers/userController";
import { authenticateToken } from "../middlewares/authMiddleware";
const router = express.Router();

router.get("/", authenticateToken, getUser);
router.patch("/update-role", updateUserRole);

export default router;
