import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpStatusCode } from "../utils/error-handler";
import {
  addCvsToRole,
  createRoleWithCvs,
  getUploadBatch,
  retryFailedCvs,
} from "../utils/screeningUpload";

const jobParams = z.object({ jobId: z.string().uuid() });
const batchParams = jobParams.extend({ batchId: z.string().uuid() });

function uploadedFiles(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

function roleText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  const role = typeof record.role === "string" ? record.role : "";
  const title = typeof record.title === "string" ? record.title : "";
  const description = typeof record.description === "string" ? record.description : "";
  if (role.trim()) return role;
  if (description.trim()) return title.trim() ? `${title.trim()}\n${description}` : description;
  return title;
}

const createScreening = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const created = await createRoleWithCvs(req.user.id, roleText(req.body), uploadedFiles(req));
    res.status(HttpStatusCode.CREATED).json(created);
  } catch (error) {
    next(error);
  }
};

const addUploads = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = jobParams.parse(req.params);
    const created = await addCvsToRole(req.user.id, jobId, uploadedFiles(req));
    res.status(HttpStatusCode.CREATED).json(created);
  } catch (error) {
    next(error);
  }
};

const getBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, batchId } = batchParams.parse(req.params);
    const batch = await getUploadBatch(req.user.id, jobId, batchId);
    res.status(HttpStatusCode.OK).json(batch);
  } catch (error) {
    next(error);
  }
};

const retryBatch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId, batchId } = batchParams.parse(req.params);
    const batch = await retryFailedCvs(req.user.id, jobId, batchId);
    res.status(HttpStatusCode.OK).json(batch);
  } catch (error) {
    next(error);
  }
};

export { createScreening, addUploads, getBatch, retryBatch };
