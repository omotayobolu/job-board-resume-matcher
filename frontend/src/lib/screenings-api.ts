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

export type ScreeningDecision = "new" | "shortlisted" | "rejected";

export type MustHave = {
  requirement: string;
  met: "yes" | "no" | "unclear";
  evidence: string;
};

export type RoleScreening = {
  id: string;
  candidate_id: string;
  name: string;
  email: string | null;
  filename: string | null;
  match_percent: number | null;
  status: ScreeningDecision | "hired";
  summary: string | null;
  strengths: string[];
  gaps: string[];
  must_haves: MustHave[];
  pipeline: "processing" | "failed" | "ready";
  file_reason: string | null;
};

export type RoleShortlist = {
  role: { id: string; title: string; description: string };
  screenings: RoleScreening[];
};

export async function fetchRoleScreenings(jobId: string): Promise<RoleShortlist> {
  const response = await axiosInstance.get<RoleShortlist>(`/jobs/${jobId}/screenings`);
  return response.data;
}

export async function updateScreeningStatus(screeningId: string, status: ScreeningDecision): Promise<void> {
  await axiosInstance.patch(`/screenings/${screeningId}/status`, { status });
}

export async function fetchScreeningCv(screeningId: string): Promise<{ url: string; filename: string }> {
  const response = await axiosInstance.get<{ url: string; filename: string }>(`/screenings/${screeningId}/cv`);
  return response.data;
}

export async function downloadShortlistCsv(jobId: string): Promise<void> {
  const response = await axiosInstance.get<Blob>(`/jobs/${jobId}/screenings/export`, { responseType: "blob" });
  const header = String(response.headers["content-disposition"] ?? "");
  const matched = /filename="([^"]+)"/.exec(header);
  const filename = matched?.[1] || "shortlist.csv";
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function retryUploadBatch(jobId: string, batchId: string): Promise<UploadBatch> {
  const response = await axiosInstance.post<UploadBatch>(`/jobs/${jobId}/uploads/${batchId}/retry`);
  return response.data;
}
