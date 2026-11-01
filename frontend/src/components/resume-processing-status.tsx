import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { axiosInstance } from "@/lib/axios-instance";
import { Button } from "./ui/button";

type ResumeStatus = {
  resume_processing_status: "pending" | "processing" | "completed" | "failed";
  resume_filename: string | null;
  can_retry: boolean;
};

export default function ResumeProcessingStatus() {
  const [retrying, setRetrying] = useState(false);
  const { data, isError, refetch } = useQuery<ResumeStatus>({
    queryKey: ["resume-processing-status"],
    queryFn: async () => {
      const response = await axiosInstance.get<ResumeStatus>("/job-seeker/profile-status");
      return response.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.resume_processing_status;
      return status === "pending" || status === "processing" ? 5000 : false;
    },
  });

  if (!data || data.resume_processing_status === "completed") {
    if (!isError) return null;
  }

  const retry = async () => {
    setRetrying(true);
    try {
      await axiosInstance.post("/job-seeker/retry-processing");
      await refetch();
      toast.success("Resume processing queued again.");
    } catch {
      toast.error("Could not retry resume processing. Please try again.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-[#E5E5E5] bg-white p-5" role="status">
      {isError ? (
        <p>Could not check your resume status. Please refresh this page.</p>
      ) : data?.resume_processing_status === "failed" ? (
        <div className="flex items-center justify-between gap-4">
          <p>{data.can_retry
            ? "We could not process your resume. Your profile is saved; please retry."
            : "Your resume file is unavailable. Please contact support to upload it again."}</p>
          {data.can_retry && (
            <Button type="button" disabled={retrying} onClick={retry}>
              {retrying ? "Retrying..." : "Retry processing"}
            </Button>
          )}
        </div>
      ) : (
        <p>Your resume is being processed. You can browse jobs while it finishes.</p>
      )}
    </div>
  );
}
