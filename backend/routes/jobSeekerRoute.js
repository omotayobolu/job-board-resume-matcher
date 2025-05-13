const express = require("express");
const router = express.Router();
const { createProfile } = require("../controllers/jobSeekerController");

const multer = require("multer");
const upload = multer();
router.post("/create-profile", upload.single("resume"), createProfile);

module.exports = router;
