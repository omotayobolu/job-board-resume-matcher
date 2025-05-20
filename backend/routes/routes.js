const express = require("express");
const router = express.Router();
const userRoute = require("./userRoute");
const jobSeekerRoute = require("./jobSeekerRoute");
const recruiterRoute = require("./recruiterRoute");
const jobsRoute = require("./jobsRoute");
const applicationRoute = require("./applicationRoute");

router.use("/api/v1/user", userRoute);
router.use("/api/v1/job-seeker", jobSeekerRoute);
router.use("/api/v1/recruiter", recruiterRoute);
router.use("/api/v1/jobs", jobsRoute);
router.use("/api/v1/applications", applicationRoute);

module.exports = router;
