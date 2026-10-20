import express from "express";
const router = express.Router();
import userRoute from "./userRoute";
import jobSeekerRoute from "./jobSeekerRoute";
import recruiterRoute from "./recruiterRoute";
import jobsRoute from "./jobsRoute";
import applicationRoute from "./applicationRoute";
import { authenticateToken } from "../middlewares/authMiddleware";
import authRoute from "../routes/authRoute";

router.use("/api/v1/auth", authRoute);
router.use("/api/v1/user", authenticateToken, userRoute);
router.use("/api/v1/job-seeker", authenticateToken, jobSeekerRoute);
router.use("/api/v1/recruiter", authenticateToken, recruiterRoute);
router.use("/api/v1/jobs", authenticateToken, jobsRoute);
router.use("/api/v1/applications", authenticateToken, applicationRoute);

export default router;
