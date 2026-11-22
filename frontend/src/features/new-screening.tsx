import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import CvDropzone from "@/components/cv-dropzone";
import ScreeningProgress from "@/components/screening-progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getApiErrorMessage } from "@/lib/api-error";
import { createScreening } from "@/lib/screenings-api";
import { selectUser } from "@/store/userSlice";
import { useSelector } from "react-redux";

export default function NewScreening() {
  const user = useSelector(selectUser);
  const queryClient = useQueryClient();
  const [role, setRole] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ jobId: string; batchId: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!role.trim()) {
      setError("Enter a role title or paste a job description.");
      return;
    }
    if (files.length === 0) {
      setError("Add at least one CV.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await createScreening(role.trim(), files);
      setCreated({ jobId: result.job_id, batchId: result.batch_id });
      setFiles([]);
      await queryClient.invalidateQueries({ queryKey: ["recruiterJobs", user.id] });
      toast.success("Screening started.");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError, "Could not start that screening."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="py-18 px-6">
      <h1 className="text-2xl font-semibold text-black">New screening</h1>
      <p className="mt-2 max-w-2xl text-[#4A4A4A]">
        Type a short role line, or paste a full job description, and drop the CVs. Shortlistly creates the role and scores each CV against it.
      </p>
      <form className="mt-8 max-w-3xl" onSubmit={submit}>
        <label htmlFor="role" className="text-sm font-medium text-black">
          Role
        </label>
        <Textarea
          id="role"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Senior Node developer, 5+ years"
          className="mt-2 min-h-40 bg-white"
          disabled={submitting}
        />
        <div className="mt-6">
          <CvDropzone files={files} onChange={setFiles} disabled={submitting} />
        </div>
        {error && <p className="mt-3 text-sm text-[#CC2424]">{error}</p>}
        <Button type="submit" variant="primary" className="mt-6 px-8" disabled={submitting}>
          {submitting ? "Starting..." : "Start screening"}
        </Button>
      </form>
      {created && (
        <div className="max-w-3xl">
          <ScreeningProgress jobId={created.jobId} batchId={created.batchId} showRoleLink />
        </div>
      )}
    </div>
  );
}
