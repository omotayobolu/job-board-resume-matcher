import express from "express";
const router = express.Router();
import { createProfile } from "../controllers/jobSeekerController";

import multer from "multer";
const upload = multer();
router.post("/create-profile", upload.single("resume"), createProfile);

export default router;
