const express = require("express");
const router = express.Router();
const userRoute = require("./userRoute");
const jobSeekerRoute = require("./jobSeekerRoute");
const recruiterRoute = require("./recruiterRoute");

router.use("/api/v1/user", userRoute);
router.use("/api/v1/job-seeker", jobSeekerRoute);
router.use("/api/v1/recruiter", recruiterRoute);

module.exports = router;
