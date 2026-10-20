import express from "express";
import {
  createRecruiterProfile,
  queryApplications,
} from "../controllers/recruiterController";
import { isRecruiter } from "../middlewares/authMiddleware";
const router = express.Router();

router.post("/create-profile", createRecruiterProfile);
router.post("/query-applications/:jobId", isRecruiter, queryApplications);

export default router;
