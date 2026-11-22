import express from "express";
import multer from "multer";
import { uploadLimits } from "../config/uploadLimits";
import { createScreening } from "../controllers/screeningController";
import { isRecruiter } from "../middlewares/authMiddleware";
import { CustomError, HttpStatusCode } from "../utils/error-handler";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: uploadLimits.maxZipBytes,
    files: uploadLimits.maxFilesPerBatch,
  },
});

function uploadCvs(req: express.Request, res: express.Response, next: express.NextFunction) {
  upload.array("files", uploadLimits.maxFilesPerBatch)(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Each file must be 50 MB or smaller. A single CV must be 10 MB or smaller.",
        true,
      ));
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT") {
      next(new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        `A screening can include at most ${uploadLimits.maxFilesPerBatch} files.`,
        true,
      ));
      return;
    }
    next(error);
  });
}

router.post("/", isRecruiter, uploadCvs, createScreening);

export default router;
