import AddRoleCvs from "@/components/add-role-cvs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getApiErrorMessage } from "@/lib/api-error";
import { axiosInstance } from "@/lib/axios-instance";
import { fetchRecruiterJobs, type Job } from "@/lib/jobs-api";
import {
  downloadShortlistCsv,
  fetchRoleScreenings,
  fetchScreeningCv,
  updateScreeningStatus,
  type RoleScreening,
  type ScreeningDecision,
} from "@/lib/screenings-api";
import { selectUser } from "@/store/userSlice";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

type Filter = "all" | ScreeningDecision | "processing" | "failed";

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected", label: "Rejected" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

const decisionLabel: Record<ScreeningDecision, string> = {
  new: "New",
  shortlisted: "Shortlist",
  rejected: "Reject",
};

function matches(item: RoleScreening, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "processing" || filter === "failed") return item.pipeline === filter;
  return item.status === filter;
}

function statusBadge(status: RoleScreening["status"]) {
  if (status === "shortlisted" || status === "hired") return <Badge variant="success">{status}</Badge>;
  if (status === "rejected") return <Badge variant="destructive">rejected</Badge>;
  return <Badge variant="default">new</Badge>;
}

const JobApplicants = () => {
  const user = useSelector(selectUser);
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const selectedJob = params.jobId ?? "";
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const { data: jobs, refetch: refetchJobs } = useQuery({
    queryKey: ["recruiterJobs", user.id],
    queryFn: () => fetchRecruiterJobs(user.id),
    enabled: !!user.id,
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["role-screenings", selectedJob],
    queryFn: () => fetchRoleScreenings(selectedJob),
    enabled: !!selectedJob,
    refetchInterval: (query) => (
      query.state.data?.screenings.some((item) => item.pipeline === "processing") ? 4000 : false
    ),
  });

  const currentJob = jobs?.find((job: Job) => job.id === selectedJob);
  const screenings = data?.screenings ?? [];
  const visible = screenings.filter((item) => matches(item, filter));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["role-screenings", selectedJob] });
    void queryClient.invalidateQueries({ queryKey: ["recruiterJobs", user.id] });
  };

  const setStatus = async (screeningId: string, status: ScreeningDecision) => {
    setUpdatingId(screeningId);
    try {
      await updateScreeningStatus(screeningId, status);
      await queryClient.invalidateQueries({ queryKey: ["role-screenings", selectedJob] });
    } catch (statusError) {
      toast.error(getApiErrorMessage(statusError, "Could not update that status."));
    } finally {
      setUpdatingId(null);
    }
  };

  const viewCv = async (screeningId: string) => {
    setViewingId(screeningId);
    try {
      const file = await fetchScreeningCv(screeningId);
      window.open(file.url, "_blank", "noopener,noreferrer");
    } catch (cvError) {
      toast.error(getApiErrorMessage(cvError, "Could not open that CV."));
    } finally {
      setViewingId(null);
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadShortlistCsv(selectedJob);
    } catch (exportError) {
      toast.error(getApiErrorMessage(exportError, "Could not export this shortlist."));
    } finally {
      setExporting(false);
    }
  };

  const toggleJobStatus = async () => {
    if (isToggling || !currentJob) return;
    try {
      setIsToggling(true);
      const newStatus = currentJob.job_status === "active" ? "closed" : "active";
      await axiosInstance.patch(`/jobs/update-job-status/${selectedJob}`, { job_status: newStatus });
      toast.success(newStatus === "closed" ? "Applications closed." : "Applications reopened.");
      await refetchJobs();
    } catch (toggleError) {
      toast.error(getApiErrorMessage(toggleError, "Failed to update this role."));
    } finally {
      setIsToggling(false);
    }
  };

  const deleteJob = async () => {
    try {
      await axiosInstance.delete(`/jobs/delete-job/${selectedJob}`);
      toast.success("Role deleted.");
      await refetchJobs();
      navigate("/dashboard");
    } catch (deleteError) {
      toast.error(getApiErrorMessage(deleteError, "Failed to delete this role."));
    }
  };

  return (
    <div className="py-18 px-6 font-inter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-2xl text-black">Shortlist</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#4A4A4A]">
            These reasons are AI suggestions. A person makes the final decision.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={!selectedJob || exporting || screenings.length === 0} onClick={exportCsv}>
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {selectedJob ? <AddRoleCvs key={selectedJob} jobId={selectedJob} onUploaded={refresh} /> : null}

      <div className="mt-7 flex flex-col gap-7 lg:flex-row lg:items-start">
        <div className="lg:w-[70%]">
          <h3 className="text-xl font-medium text-black">{data?.role.title || "Role"}</h3>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-3xl border border-[#E5E5E5] bg-white p-5">
            <p className="whitespace-pre-wrap text-sm text-[#4A4A4A]">{data?.role.description}</p>
          </div>
        </div>
        <div className="lg:w-[30%]">
          <h3 className="text-xl font-medium text-black">Role</h3>
          <Select value={selectedJob} onValueChange={(job) => navigate(`/dashboard/applicants/${job}`)}>
            <SelectTrigger className="mt-2 rounded-none border-gray-300 bg-white text-black">
              <SelectValue placeholder="Select a role">
                {currentJob?.job_title || data?.role.title || "Select a role"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {jobs?.map((job) => (
                <SelectItem key={job.id} value={job.id}>{job.job_title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" className="w-1/2" disabled={isToggling || !currentJob} onClick={toggleJobStatus}>
              {isToggling ? "Saving..." : currentJob?.job_status === "active" ? "Close role" : "Reopen role"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" className="w-1/2 border-[#610D0D]">Delete role</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this role?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently deletes the role and its shortlist.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteJob} className="bg-[#e7000b] hover:opacity-90">Delete role</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <label className="mt-4 block text-sm font-medium text-black" htmlFor="shortlist-filter">Status</label>
          <Select value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <SelectTrigger id="shortlist-filter" className="mt-2 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-7 flex flex-col gap-3">
        {isLoading ? <p className="text-sm text-[#4A4A4A]">Loading shortlist...</p> : null}
        {isError ? <p className="text-sm text-[#CC2424]">{getApiErrorMessage(error, "Could not load this shortlist.")}</p> : null}
        {!isLoading && !isError && visible.length === 0 ? (
          <p className="rounded-3xl border border-[#E5E5E5] bg-white p-5 text-sm text-[#4A4A4A]">
            {screenings.length === 0 ? "Uploaded CVs for this role show up here, ranked by match." : "No candidates match this filter."}
          </p>
        ) : null}
        {visible.map((item) => {
          const rank = screenings.findIndex((row) => row.id === item.id) + 1;
          const open = openId === item.id;
          return (
            <article key={item.id} className="rounded-3xl border border-[#E5E5E5] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-[#4A4A4A]">#{rank}</p>
                  <h4 className="text-lg font-medium text-black">{item.name}</h4>
                  {item.email ? <p className="text-sm text-[#4A4A4A]">{item.email}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold text-black">
                    {item.match_percent === null ? "—" : `${item.match_percent}%`}
                  </span>
                  {statusBadge(item.status)}
                  {item.pipeline === "processing" ? <Badge variant="warning">processing</Badge> : null}
                  {item.pipeline === "failed" ? <Badge variant="destructive">failed</Badge> : null}
                </div>
              </div>
              <p className="mt-3 text-sm text-[#4A4A4A]">
                {item.pipeline === "processing"
                  ? "Scoring this CV."
                  : item.pipeline === "failed"
                    ? item.file_reason || "Scoring failed. You can still set a status."
                    : item.summary || "No AI notes for this CV."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["new", "shortlisted", "rejected"] as const).map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={item.status === status ? "primary" : "outline"}
                    disabled={updatingId === item.id || item.status === status}
                    onClick={() => setStatus(item.id, status)}
                  >
                    {decisionLabel[status]}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" disabled={viewingId === item.id} onClick={() => viewCv(item.id)}>
                  {viewingId === item.id ? "Opening..." : "View CV"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}>
                  {open ? "Hide reasons" : "Strengths and gaps"}
                </Button>
              </div>
              {open ? (
                <div className="mt-4 grid gap-4 text-sm md:grid-cols-3">
                  <div>
                    <p className="font-medium text-black">Strengths</p>
                    {item.strengths.length === 0 ? <p className="mt-1 text-[#4A4A4A]">None noted.</p> : (
                      <ul className="mt-1 list-disc pl-4 text-[#4A4A4A]">
                        {item.strengths.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-black">Gaps</p>
                    {item.gaps.length === 0 ? <p className="mt-1 text-[#4A4A4A]">None noted.</p> : (
                      <ul className="mt-1 list-disc pl-4 text-[#4A4A4A]">
                        {item.gaps.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-black">Must-haves</p>
                    {item.must_haves.length === 0 ? <p className="mt-1 text-[#4A4A4A]">The role text did not state any.</p> : (
                      <ul className="mt-1 flex flex-col gap-2 text-[#4A4A4A]">
                        {item.must_haves.map((check) => (
                          <li key={check.requirement}>
                            <span className="font-medium text-black">{check.requirement}</span>
                            {` · ${check.met}`}
                            {check.evidence ? ` · ${check.evidence}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
};

export default JobApplicants;
