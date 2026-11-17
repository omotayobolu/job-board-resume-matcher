import { lazy, Suspense, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { useSelector } from "react-redux";
import { axiosInstance } from "@/lib/axios-instance";
import { getApiErrorMessage } from "@/lib/api-error";
import { selectUser } from "@/store/userSlice";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const ResumePdf = lazy(() => import("@/components/resume-pdf"));

type ResumePreview = { url: string; filename: string; content_type: string };

type JobSeekerProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string;
  location: string;
  remote_preference: string;
  resume_filename: string | null;
  resume_processing_status: "pending" | "processing" | "completed" | "failed";
  created_at: string | null;
  parsed_resume: {
    professional_summary: string | null;
    skills: string | null;
    years_of_experience: string | null;
    education: string | null;
    certifications: string | null;
  } | null;
};

const statusLabels: Record<
  JobSeekerProfile["resume_processing_status"],
  string
> = {
  pending: "Waiting to process",
  processing: "Processing",
  completed: "Ready",
  failed: "Processing failed",
};

export default function JobSeekerProfilePage() {
  const user = useSelector(selectUser);
  const fileInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const preview = useMutation({
    mutationFn: async () => {
      const response = await axiosInstance.get<ResumePreview>(
        "/job-seeker/resume-preview",
      );
      const metadata = response.data;
      // Fetch through the authenticated API so preview does not require S3 CORS.
      const file =
        metadata.content_type === "application/pdf"
          ? (
              await axiosInstance.get<Blob>("/job-seeker/resume-content", {
                responseType: "blob",
              })
            ).data
          : null;
      return { ...metadata, file };
    },
  });
  const replacement = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("resume", file);
      await axiosInstance.put("/job-seeker/resume", form);
    },
    onSuccess: async () => {
      preview.reset();
      setPreviewOpen(false);
      toast.success("Resume replaced. Your new resume is processing.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["job-seeker-profile"] }),
        queryClient.invalidateQueries({
          queryKey: ["resume-processing-status"],
        }),
      ]);
    },
    onError: (error) =>
      toast.error(
        getApiErrorMessage(
          error,
          "Could not replace your resume. Please try again.",
        ),
      ),
  });
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["job-seeker-profile"],
    queryFn: async () => {
      const response = await axiosInstance.get<{ profile: JobSeekerProfile }>(
        "/job-seeker/profile",
      );
      return response.data.profile;
    },
    enabled: user.role === "job_seeker",
    refetchInterval: (query) => {
      const status = query.state.data?.resume_processing_status;
      return status === "pending" || status === "processing" ? 5000 : false;
    },
  });

  if (user.role !== "job_seeker") return <Navigate to="/dashboard" replace />;

  if (isPending) {
    return (
      <main className="p-8" role="status">
        Loading your profile...
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-semibold">Your profile</h1>
        <div className="mt-6 rounded-2xl bg-white p-6">
          <p role="alert" className="text-[#CC2424]">
            {getApiErrorMessage(
              error,
              "Could not load your profile. Please try again.",
            )}
          </p>
          <Button type="button" className="mt-4" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      </main>
    );
  }

  const details = data.parsed_resume;

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="text-3xl font-semibold text-[#212A37]">Your profile</h1>
      <p className="mt-2 text-[#68707C]">
        Your details and the information found in your resume.
      </p>

      <section
        className="mt-8 rounded-2xl bg-white p-6 shadow-sm"
        aria-label="Profile details"
      >
        <h2 className="text-2xl font-semibold text-[#212A37]">
          {data.full_name || "Job seeker"}
        </h2>
        {data.email && <p className="mt-1 text-[#68707C]">{data.email}</p>}
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-[#68707C]">Job title</dt>
            <dd className="mt-1 font-medium">
              {data.job_title || "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[#68707C]">Location</dt>
            <dd className="mt-1 font-medium">
              {data.location || "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[#68707C]">Work preference</dt>
            <dd className="mt-1 font-medium">
              {data.remote_preference || "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-[#68707C]">Member since</dt>
            <dd className="mt-1 font-medium">
              {data.created_at
                ? new Date(data.created_at).toLocaleDateString()
                : "Not available"}
            </dd>
          </div>
        </dl>
      </section>

      <section
        className="mt-6 rounded-2xl bg-white p-6 shadow-sm"
        aria-label="Resume"
      >
        <h2 className="text-xl font-semibold text-[#212A37]">Resume</h2>
        <dl className="mt-4">
          <div>
            <dt className="text-sm text-[#68707C]">File</dt>
            <dd className="mt-1 font-medium break-all">
              {data.resume_filename || "No file uploaded"}
            </dd>
          </div>
        </dl>
        {data.resume_processing_status !== "completed" && (
          <p className="mt-2 text-sm text-[#68707C]" role="status">
            {statusLabels[data.resume_processing_status]}
          </p>
        )}
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          aria-label="Select replacement resume"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={replacement.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            if (
              ![
                "application/pdf",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              ].includes(file.type)
            ) {
              toast.error("Resume must be a PDF or DOCX file.");
              return;
            }
            if (file.size > 5 * 1024 * 1024) {
              toast.error("Your resume must be 5 MB or smaller.");
              return;
            }
            replacement.mutate(file);
          }}
        />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={replacement.isPending}
            onClick={() => {
              preview.reset();
              setPreviewOpen(true);
              preview.mutate();
            }}
          >
            Preview Resume
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={replacement.isPending}
            onClick={() => fileInput.current?.click()}
          >
            {replacement.isPending ? "Replacing resume..." : "Replace Resume"}
          </Button>
        </div>
        <Dialog
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) preview.reset();
          }}
        >
          <DialogContent
            className="z-[70] h-[90dvh] w-[calc(100%-2rem)] max-w-5xl rounded-xl bg-white p-4 sm:max-w-5xl sm:p-6 grid-rows-[auto_auto_minmax(0,1fr)_auto]"
            overlayClassName="z-[60] bg-slate-100"
            showCloseButton={false}
          >
            <DialogTitle>Resume preview</DialogTitle>
            <DialogDescription>
              {preview.data?.filename || "Your uploaded resume"}
            </DialogDescription>
            <div className="min-h-0 overflow-auto bg-slate-100 p-3">
              {preview.isPending && <p role="status">Loading your resume...</p>}
              {preview.isError && (
                <div>
                  <p role="alert">
                    {getApiErrorMessage(
                      preview.error,
                      "Could not load your resume.",
                    )}
                  </p>
                  <Button type="button" onClick={() => preview.mutate()}>
                    Try again
                  </Button>
                </div>
              )}
              {preview.data?.file && (
                <Suspense fallback={<p role="status">Loading PDF viewer...</p>}>
                  <ResumePdf file={preview.data.file} />
                </Suspense>
              )}
              {preview.data && !preview.data.file && (
                <p>Download this DOCX resume to open it on your device.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-4">
              {preview.data && (
                <a
                  href={preview.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {preview.data.file ? "Open original" : "Download resume"}
                </a>
              )}
              <DialogClose asChild>
                <Button type="button">Close</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
        <p className="mt-2 text-sm text-[#68707C]">PDF or DOCX, up to 5 MB.</p>
        {data.resume_processing_status === "failed" && (
          <p className="mt-4 text-[#CC2424]">
            We could not process your resume. You can retry from the dashboard.
          </p>
        )}
        {!details && data.resume_processing_status !== "failed" && (
          <p className="mt-4 text-[#68707C]">
            Resume details will appear after processing finishes.
          </p>
        )}
      </section>

      {details && (
        <section
          className="mt-6 rounded-2xl bg-white p-6 shadow-sm"
          aria-label="Extracted resume details"
        >
          <h2 className="text-xl font-semibold text-[#212A37]">
            Resume details
          </h2>
          <dl className="mt-5 space-y-5">
            {details.professional_summary && (
              <div>
                <dt className="font-semibold">Summary</dt>
                <dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">
                  {details.professional_summary}
                </dd>
              </div>
            )}
            {details.skills && (
              <div>
                <dt className="font-semibold">Skills</dt>
                <dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">
                  {details.skills}
                </dd>
              </div>
            )}
            {details.years_of_experience && (
              <div>
                <dt className="font-semibold">Experience</dt>
                <dd className="mt-1 text-[#4A4A4A]">
                  {details.years_of_experience}
                </dd>
              </div>
            )}
            {details.education && (
              <div>
                <dt className="font-semibold">Education</dt>
                <dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">
                  {details.education}
                </dd>
              </div>
            )}
            {details.certifications && (
              <div>
                <dt className="font-semibold">Certifications</dt>
                <dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">
                  {details.certifications}
                </dd>
              </div>
            )}
          </dl>
        </section>
      )}
    </main>
  );
}
