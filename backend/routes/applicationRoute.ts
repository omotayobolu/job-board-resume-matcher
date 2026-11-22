import express from "express";
const router = express.Router();
import {
  applyToJob,
  getAllApplications,
} from "../controllers/applicationController";
import { blockJobSeekerFeatures } from "../middlewares/jobSeekerFeatures";

router.post("/apply", blockJobSeekerFeatures, applyToJob).get("/:jobId", getAllApplications);

export default router;
