import express from "express";
const router = express.Router();
import { createProfile } from "../controllers/jobSeekerController";

import multer from "multer";
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
router.post("/create-profile", upload.single("resume"), createProfile);

export default router;
