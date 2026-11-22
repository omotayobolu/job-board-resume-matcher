import { axiosInstance } from "@/lib/axios-instance";

export type BatchFileStatus = "pending" | "processing" | "completed" | "failed" | "skipped";

export type UploadBatchFile = {
  id: string;
  filename: string;
  status: BatchFileStatus;
  reason: string | null;
  candidate_id: string | null;
  screening_id: string | null;
};

export type UploadBatch = {
  id: string;
  job_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  total_files: number;
  processed_files: number;
  failed_files: number;
  skipped_files: number;
  files: UploadBatchFile[];
};

export type CreatedBatch = {
  job_id: string;
  batch_id: string;
  total_files: number;
  skipped_files: number;
};

export async function createScreening(role: string, files: File[]): Promise<CreatedBatch> {
  const body = new FormData();
  body.append("role", role);
  for (const file of files) body.append("files", file);
  const response = await axiosInstance.post<CreatedBatch>("/screenings", body);
  return response.data;
}

export async function addCvs(jobId: string, files: File[]): Promise<CreatedBatch> {
  const body = new FormData();
  for (const file of files) body.append("files", file);
  const response = await axiosInstance.post<CreatedBatch>(`/jobs/${jobId}/uploads`, body);
  return response.data;
}

export async function fetchUploadBatch(jobId: string, batchId: string): Promise<UploadBatch> {
  const response = await axiosInstance.get<UploadBatch>(`/jobs/${jobId}/uploads/${batchId}`);
  return response.data;
}

export async function retryUploadBatch(jobId: string, batchId: string): Promise<UploadBatch> {
  const response = await axiosInstance.post<UploadBatch>(`/jobs/${jobId}/uploads/${batchId}/retry`);
  return response.data;
}
