const express = require("express");
const {
  createRecruiterProfile,
} = require("../controllers/recruiterController");
const router = express.Router();

router.post("/create-profile", createRecruiterProfile);

module.exports = router;
