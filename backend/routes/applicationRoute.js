const express = require("express");
const router = express.Router();
const {
  applyToJob,
  getAllApplications,
} = require("../controllers/applicationController");

router.post("/apply", applyToJob).get("/:jobId", getAllApplications);

module.exports = router;
