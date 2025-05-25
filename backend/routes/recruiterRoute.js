const express = require("express");
const {
  createRecruiterProfile,
  queryApplications,
} = require("../controllers/recruiterController");
const router = express.Router();

router.post("/create-profile", createRecruiterProfile);
router.post("/query-applications", queryApplications);

module.exports = router;
