import { useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-error";
import { addCvs } from "@/lib/screenings-api";
import CvDropzone from "./cv-dropzone";
import ScreeningProgress from "./screening-progress";
import { Button } from "./ui/button";

export default function AddRoleCvs({ jobId }: { jobId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (files.length === 0) {
      setError("Add at least one CV.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const created = await addCvs(jobId, files);
      setBatchId(created.batch_id);
      setFiles([]);
      toast.success("CVs added to this role.");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Could not upload those CVs."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 rounded-3xl border border-[#E5E5E5] bg-white p-5">
      <h3 className="text-lg font-medium text-black">Add CVs</h3>
      <p className="mt-1 text-sm text-[#4A4A4A]">Upload more PDFs, DOCX files, or a zip for this role.</p>
      <div className="mt-4">
        <CvDropzone files={files} onChange={setFiles} disabled={submitting} />
      </div>
      {error && <p className="mt-3 text-sm text-[#CC2424]">{error}</p>}
      <Button type="button" variant="primary" className="mt-4" disabled={submitting} onClick={submit}>
        {submitting ? "Uploading..." : "Upload CVs"}
      </Button>
      {batchId && <ScreeningProgress jobId={jobId} batchId={batchId} />}
    </div>
  );
}
