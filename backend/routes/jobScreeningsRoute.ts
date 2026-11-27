import express from "express";
import { exportScreenings, listScreenings } from "../controllers/screeningController";
import { isRecruiter } from "../middlewares/authMiddleware";

const router = express.Router({ mergeParams: true });

router.get("/", isRecruiter, listScreenings);
router.get("/export", isRecruiter, exportScreenings);

export default router;
