import express from "express";
const router = express.Router();
import { getResumeContent, getResumePreview, replaceResume, createProfile, getProfile, getProfileStatus, retryProfileProcessing } from "../controllers/jobSeekerController";

import multer from "multer";
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
router.post("/create-profile", upload.single("resume"), createProfile);
router.put("/resume", upload.single("resume"), replaceResume);
router.get("/resume-content", getResumeContent);
router.get("/resume-preview", getResumePreview);
router.get("/profile", getProfile);
router.get("/profile-status", getProfileStatus);
router.post("/retry-processing", retryProfileProcessing);

export default router;
