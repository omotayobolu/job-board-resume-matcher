const express = require("express");
const router = express.Router();
const userRoute = require("./userRoute");
const jobSeekerRoute = require("./jobSeekerRoute");
const recruiterRoute = require("./recruiterRoute");
const jobsRoute = require("./jobsRoute");
const applicationRoute = require("./applicationRoute");
const { authenticateToken } = require("../middlewares/authMiddleware");
const authRoute = require("../routes/authRoute");

router.use("/api/v1/auth", authRoute);
router.use("/api/v1/user", authenticateToken, userRoute);
router.use("/api/v1/job-seeker", authenticateToken, jobSeekerRoute);
router.use("/api/v1/recruiter", authenticateToken, recruiterRoute);
router.use("/api/v1/jobs", authenticateToken, jobsRoute);
router.use("/api/v1/applications", authenticateToken, applicationRoute);

module.exports = router;
