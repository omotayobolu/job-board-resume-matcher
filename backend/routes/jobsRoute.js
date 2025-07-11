const express = require("express");
const router = express.Router();
const {
  getJobs,
  getJob,
  createJob,
  deleteJob,
  getJobsByRecruiter,
} = require("../controllers/jobsController");
const { isRecruiter } = require("../middlewares/authMiddleware");

router
  .post("/create-job", isRecruiter, createJob)
  .get("/get-jobs", getJobs)
  .get("/get-jobs/:recruiterId", isRecruiter, getJobsByRecruiter)
  .get("/get-job/:id", getJob)
  .delete("/delete-job/:id", isRecruiter, deleteJob);

module.exports = router;
