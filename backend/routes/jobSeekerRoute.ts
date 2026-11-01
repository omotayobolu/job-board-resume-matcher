import express from "express";
const router = express.Router();
import { createProfile, getProfileStatus, retryProfileProcessing } from "../controllers/jobSeekerController";

import multer from "multer";
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
router.post("/create-profile", upload.single("resume"), createProfile);
router.get("/profile-status", getProfileStatus);
router.post("/retry-processing", retryProfileProcessing);

export default router;
