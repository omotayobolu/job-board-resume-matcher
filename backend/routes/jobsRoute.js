const express = require("express");
const router = express.Router();
const {
  getJobs,
  getJob,
  createJob,
  deleteJob,
} = require("../controllers/jobsController");

router
  .post("/create-job", createJob)
  .get("/get-jobs", getJobs)
  .get("/get-job/:id", getJob)
  .delete("/delete-job/:id", deleteJob);

module.exports = router;
