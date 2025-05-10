const express = require("express");
const router = express.Router();
const userRoute = require("./userRoute");
const jobSeekerRoute = require("./jobSeekerRoute");

router.use("/api/v1/user", userRoute);
router.use("/api/v1/job-seeker", jobSeekerRoute);

module.exports = router;
