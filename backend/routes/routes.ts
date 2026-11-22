import express from "express";
const router = express.Router();
import userRoute from "./userRoute";
import jobSeekerRoute from "./jobSeekerRoute";
import recruiterRoute from "./recruiterRoute";
import jobsRoute from "./jobsRoute";
import applicationRoute from "./applicationRoute";
import screeningRoute from "./screeningRoute";
import jobUploadsRoute from "./jobUploadsRoute";
import { authenticateToken } from "../middlewares/authMiddleware";
import { blockHiddenJobRoutes, blockJobSeekerFeatures } from "../middlewares/jobSeekerFeatures";
import authRoute from "../routes/authRoute";

router.use(blockHiddenJobRoutes);
router.use("/api/v1/auth", authRoute);
router.use("/api/v1/user", authenticateToken, userRoute);
router.use("/api/v1/job-seeker", blockJobSeekerFeatures, authenticateToken, jobSeekerRoute);
router.use("/api/v1/recruiter", authenticateToken, recruiterRoute);
router.use("/api/v1/screenings", authenticateToken, screeningRoute);
router.use("/api/v1/jobs/:jobId/uploads", authenticateToken, jobUploadsRoute);
router.use("/api/v1/jobs", authenticateToken, jobsRoute);
router.use("/api/v1/applications", authenticateToken, applicationRoute);

export default router;
