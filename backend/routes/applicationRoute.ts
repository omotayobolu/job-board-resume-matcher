import express from "express";
const router = express.Router();
import {
  applyToJob,
  getAllApplications,
} from "../controllers/applicationController";

router.post("/apply", applyToJob).get("/:jobId", getAllApplications);

export default router;
