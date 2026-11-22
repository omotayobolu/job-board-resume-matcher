import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { idParamSchema } from "../schemas";
import { CustomError, HttpStatusCode } from "../utils/error-handler";
import {
  exportRoleScreenings,
  listRoleScreenings,
  screeningCvUrl,
  screeningDecisionSchema,
  updateScreeningStatus,
} from "../utils/shortlist";
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

const listScreenings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = jobParams.parse(req.params);
    const listed = await listRoleScreenings(req.user.id, jobId);
    res.setHeader("Cache-Control", "no-store");
    res.status(HttpStatusCode.OK).json(listed);
  } catch (error) {
    next(error);
  }
};

const exportScreenings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = jobParams.parse(req.params);
    const exported = await exportRoleScreenings(req.user.id, jobId);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
    res.status(HttpStatusCode.OK).send(exported.csv);
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const parsed = screeningDecisionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "Status must be new, shortlisted, or rejected.",
        true,
      );
    }
    const updated = await updateScreeningStatus(req.user.id, id, parsed.data.status);
    res.setHeader("Cache-Control", "no-store");
    res.status(HttpStatusCode.OK).json(updated);
  } catch (error) {
    next(error);
  }
};

const viewCv = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const signed = await screeningCvUrl(req.user.id, id);
    res.setHeader("Cache-Control", "no-store");
    res.status(HttpStatusCode.OK).json(signed);
  } catch (error) {
    next(error);
  }
};

export { createScreening, addUploads, getBatch, retryBatch, listScreenings, exportScreenings, updateStatus, viewCv };
