import express from "express";
const router = express.Router();
import {
  getJobs,
  getJob,
  getRecommendedJobs,
  createJob,
  deleteJob,
  getJobsByRecruiter,
  updateJobStatus,
} from "../controllers/jobsController";
import { isJobSeeker, isRecruiter } from "../middlewares/authMiddleware";

router
  .post("/create-job", isRecruiter, createJob)
  .get("/get-jobs", getJobs)
  .get("/recommended", isJobSeeker, getRecommendedJobs)
  .get("/get-jobs/:recruiterId", isRecruiter, getJobsByRecruiter)
  .get("/get-job/:id", getJob)
  .patch("/update-job-status/:id", isRecruiter, updateJobStatus)
  .delete("/delete-job/:id", isRecruiter, deleteJob);

export default router;
