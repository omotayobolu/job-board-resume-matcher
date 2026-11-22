import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-error";
import { fetchUploadBatch, retryUploadBatch, type UploadBatch } from "@/lib/screenings-api";
import { Button } from "./ui/button";

type ScreeningProgressProps = {
  jobId: string;
  batchId: string;
  showRoleLink?: boolean;
};

function isRunning(status: UploadBatch["status"] | undefined): boolean {
  return status === "pending" || status === "processing";
}

export default function ScreeningProgress({ jobId, batchId, showRoleLink }: ScreeningProgressProps) {
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const { data, isError, error, refetch } = useQuery({
    queryKey: ["upload-batch", jobId, batchId],
    queryFn: () => fetchUploadBatch(jobId, batchId),
    refetchInterval: (query) => (isRunning(query.state.data?.status) ? 5000 : false),
  });

  const retry = async () => {
    setRetrying(true);
    try {
      await retryUploadBatch(jobId, batchId);
      await refetch();
      toast.success("Failed CVs queued again.");
    } catch (retryError) {
      toast.error(getApiErrorMessage(retryError, "Could not retry those CVs."));
    } finally {
      setRetrying(false);
    }
  };

  if (isError) {
    return (
      <div className="mt-6 rounded-2xl border border-[#E5E5E5] bg-white p-5" role="alert">
        <p>{getApiErrorMessage(error, "Could not check this upload.")}</p>
        <Button type="button" className="mt-3" onClick={() => queryClient.invalidateQueries({ queryKey: ["upload-batch", jobId, batchId] })}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mt-6 rounded-2xl border border-[#E5E5E5] bg-white p-5" role="status">
        <p>Checking upload progress...</p>
      </div>
    );
  }

  const running = isRunning(data.status);

  return (
    <div className="mt-6 rounded-2xl border border-[#E5E5E5] bg-white p-5" role="status">
      <p className="text-lg font-medium text-black">
        {running ? "Scoring CVs..." : "Upload finished"}
      </p>
      <p className="mt-2 text-sm text-[#4A4A4A]">
        {data.processed_files} processed, {data.failed_files} failed, {data.skipped_files} skipped, out of {data.total_files}.
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {data.files.map((file) => (
          <li key={file.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-black">{file.filename}</span>
            <span className="text-right text-[#4A4A4A]">
              <span className="capitalize">{file.status}</span>
              {file.reason ? <span className="block text-xs">{file.reason}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      {data.failed_files > 0 && (
        <Button type="button" className="mt-4" disabled={retrying} onClick={retry}>
          {retrying ? "Retrying..." : "Retry failed CVs"}
        </Button>
      )}
      {showRoleLink && !running && (
        <p className="mt-4 text-sm">
          <Link to={`/dashboard/applicants/${jobId}`} className="font-semibold text-purple">
            View this role
          </Link>
          <span className="text-[#4A4A4A]">. Scores are saved. The ranked shortlist comes in the next update.</span>
        </p>
      )}
    </div>
  );
}
