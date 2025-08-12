import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import SearchIcon from "../assets/search.svg";
import ExportIcon from "../assets/export.svg";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Add, Send } from "iconsax-reactjs";
import chatbot from "../assets/chatbot.svg";
import {
  fetchApplicantsByJobId,
  fetchRecruiterJobs,
  type Applicants,
  type Job,
} from "@/lib/jobs-api";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { selectUser } from "@/store/userSlice";
import { useSelector } from "react-redux";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import axios from "axios";
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

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const JobApplicants = () => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isToggling, setIsToggling] = useState(false);
  const [query, setQuery] = useState("");
  const [isQueryLoading, setIsQueryLoading] = useState(false);
  const user = useSelector(selectUser);
  const params = useParams();
  const jobId = params.jobId;
  const navigate = useNavigate();

  const [selectedJob, setSelectedJob] = useState(
    jobId ? (jobId as string) : ""
  );

  useEffect(() => {
    if (jobId) {
      setSelectedJob(jobId);
    }
  }, [jobId]);

  const { data: applicants, isLoading } = useQuery({
    queryKey: ["applicants", selectedJob],
    queryFn: () => fetchApplicantsByJobId(selectedJob),
    enabled: !!selectedJob,
  });

  const { data: jobs, refetch: refetchJobs } = useQuery({
    queryKey: ["recruiterJobs", user.id],
    queryFn: () => fetchRecruiterJobs(user.id),
    enabled: !!user.id,
  });

  const filteredApplicants = applicants?.filter((applicant: Applicants) =>
    applicant.job_seeker_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentJob = jobs?.find((job: Job) => job.id === selectedJob);

  const handleExportExcel = () => {
    if (!applicants || applicants.length === 0) {
      toast.error("No applicants to export.");
    }

    const dataToExport = applicants?.map((applicant: Applicants) => ({
      "Applicant's Name": applicant.job_seeker_name,
      "Match Score (%)": (applicant.score * 100).toFixed(2),
      "Application Status": applicant.status,
      "Date Applied": formatDate(applicant.applied_at),
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport ?? []);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Applicants");
    XLSX.writeFile(workbook, `Applicants_${selectedJob}.xlsx`);
  };

  const ToggleJobStatus = async () => {
    if (isToggling) return;
    try {
      setIsToggling(true);
      const newStatus =
        currentJob?.job_status === "active" ? "closed" : "active";
      const actionText = newStatus === "closed" ? "closed" : "reopened";
      await axios.patch(
        `${import.meta.env.VITE_API_URL}/jobs/update-job-status/${selectedJob}`,
        { job_status: newStatus },
        { withCredentials: true }
      );
      toast.success(`Applications ${actionText} successfully.`);
      await refetchJobs();
      setIsToggling(false);
    } catch (error) {
      console.error("Error closing applications:", error);
      toast.error("Failed to close applications.");
      setIsToggling(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    try {
      await axios.delete(
        `${import.meta.env.VITE_API_URL}/jobs/delete-job/${jobId}`,
        { withCredentials: true }
      );
      toast.success("Job deleted successfully.");
      navigate("/dashboard");
      refetchJobs();
      setSelectedJob("");
    } catch (error) {
      console.error("Error deleting job:", error);
      toast.error("Failed to delete job.");
    }
  };

  const handleQueryApplications = async (question: string) => {
    try {
      setIsQueryLoading(true);
      const response = await axios.post(
        `${
          import.meta.env.VITE_API_URL
        }/recruiter/query-applications/${selectedJob}`,
        {
          question,
        },
        { withCredentials: true }
      );
      alert(response.data.answer);

      setQuery("");
      setIsQueryLoading(false);
    } catch (error) {
      console.error("Error querying applications:", error);
      toast.error("Failed to query applications.");
      setIsQueryLoading(false);
    }
  };

  return (
    <div className="py-18 px-6 font-inter relative">
      <h2 className="font-semibold text-2xl text-black">Applicants</h2>
      <div className="mt-7 w-full flex flex-row items-start gap-7.5">
        <div className="w-[70%]">
          <h4 className="text-xl font-medium text-black">
            Job Description Summary
          </h4>
          <div className="mt-2 border border-[#E5E5E5] bg-white rounded-3xl p-5 pb-11.5">
            <p className="text-sm font-normal text-[#4A4A4A]">
              {currentJob?.job_description
                ? currentJob.job_description.split(".").slice(0, 3).join(".") +
                  (currentJob.job_description.split(".").length > 3 ? "." : "")
                : ""}
            </p>
            <div className="mt-5 flex flex-row items-center gap-5">
              <p className="text-base font-semibold">Skills: </p>
              <div className="flex flex-row items-center gap-2">
                {currentJob?.required_skills.map((skill: string) => (
                  <div className="bg-[#E5E5E5] py-1 px-3 rounded-4xl">
                    <span className="text-sm font-medium">{skill}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="w-[30%]">
          <h4 className="text-xl font-medium text-black">Job Listing</h4>
          <Select
            value={selectedJob}
            onValueChange={(job) => setSelectedJob(job)}
          >
            <SelectTrigger className="border-gray-300 mt-2 bg-white rounded-none text-black">
              <SelectValue>
                {selectedJob && jobs
                  ? jobs.find((jobItem: Job) => jobItem.id === selectedJob)
                      ?.job_title
                  : "Select Job"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {jobs &&
                jobs.map((jobItem: Job) => (
                  <SelectItem key={jobItem.id} value={jobItem.id}>
                    {jobItem.job_title}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className="flex flex-row items-center gap-2 mt-4 w-full">
            <Button
              onClick={ToggleJobStatus}
              disabled={isToggling}
              variant="outline"
              className="w-1/2 font-normal hover:bg-[#292D32] hover:text-white transition-colors duration-200 flex items-center justify-center gap-2 px-3 py-2 h-10"
            >
              <span className="text-sm">
                {isToggling
                  ? currentJob?.job_status === "active"
                    ? "Closing..."
                    : "Reopening..."
                  : currentJob?.job_status === "active"
                  ? "Close Applications"
                  : "Reopen Applications"}
              </span>
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-1/2 font-normal border-[#610D0D] hover:bg-[#610D0D] hover:text-white transition-colors duration-200 flex items-center justify-center gap-2 px-3 py-2 h-10"
                >
                  <span className="text-sm">Delete Job</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to delete this Job?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    your job post.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteJob(selectedJob)}
                    className="bg-[#e7000b] hover:opacity-90"
                  >
                    Delete Job
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="mt-6 flex items-center justify-between gap-4">
            <div className="flex items-center border border-[#E5E5E5] bg-white rounded-md py-3 px-4 flex-1">
              <img
                src={SearchIcon}
                alt="Search Icon"
                className="w-5 h-5 mr-2"
              />
              <input
                type="text"
                placeholder="Search applicants"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
            <div
              onClick={handleExportExcel}
              className="border border-[#E5E5E5] bg-white rounded-md p-3 cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <img src={ExportIcon} alt="Export" />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-7.5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Checkbox />
              </TableHead>
              <TableHead>Applicant's Name</TableHead>
              <TableHead>Match Score (%)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date Applied</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredApplicants && filteredApplicants.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-gray-500 py-4"
                >
                  No applicants found for this job.
                </TableCell>
              </TableRow>
            ) : (
              filteredApplicants?.map((applicant, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Checkbox />
                  </TableCell>
                  <TableCell>{applicant.job_seeker_name}</TableCell>
                  <TableCell>{(applicant.score * 100).toFixed(2)}</TableCell>
                  <TableCell>
                    {(() => {
                      switch (applicant.status) {
                        case "Applied":
                          return <Badge variant="default">Applied</Badge>;
                        case "Interviewing":
                          return <Badge variant="warning">Interviewing</Badge>;
                        case "Hired":
                          return <Badge variant="success">Hired</Badge>;
                        case "Rejected":
                          return <Badge variant="destructive">Rejected</Badge>;
                        default:
                          return <Badge>{applicant.status}</Badge>;
                      }
                    })()}
                  </TableCell>
                  <TableCell>{formatDate(applicant.applied_at)}</TableCell>
                  <TableCell>
                    <Button variant="primary" size="md">
                      Message
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div
        className="fixed bottom-6 right-6 p-2 rounded-full bg-white cursor-pointer"
        onClick={() => setIsChatOpen(!isChatOpen)}
      >
        {isChatOpen ? (
          <Add
            variant="Linear"
            width="48px"
            height="48px"
            color="#292D32"
            className="rotate-45"
          />
        ) : (
          <img src={chatbot} alt="" />
        )}
      </div>
      {isChatOpen && (
        <div className="fixed bottom-18 right-6 w-[460px] h-[400px] bg-white border border-[#E5E5E5] rounded-lg shadow-lg p-4 flex flex-col">
          <div className="flex flex-row justify-between items-center mb-4">
            <h4 className="text-lg font-medium text-black">Chatbot</h4>
            <button
              className="cursor-pointer"
              onClick={() => setIsChatOpen(false)}
            >
              <Add
                variant="Linear"
                width="36px"
                height="36px"
                color="#292D32"
                className="rotate-45"
              />
            </button>
          </div>
          <div className="flex flex-col flex-1 gap-4 overflow-y-auto w-full">
            <div className="bg-[#F5F7FB] p-3 rounded-lg text-sm text-black w-[250px]">
              Hello! How can I assist you today?
            </div>
            {isQueryLoading && (
              <div className="bg-[#F5F7FB] w-[100px]  py-2 px-5 rounded-r-[26px] rounded-tl-[26px] text-white relative flex flex-row items-center gap-1">
                <div className="w-4 h-4 rounded-full bg-[#BFBDBD] animate-bounce"></div>
                <div className="w-4 h-4 rounded-full bg-[#D1D1D1] animate-bounce delay-150"></div>
                <div className="w-4 h-4 rounded-full bg-[#E5E5E5] animate-bounce delay-300"></div>
              </div>
            )}
            <div className="bg-purple flex  self-end w-[250px] py-3 px-5 rounded-l-[26px] rounded-tr-[26px] text-white">
              You can ask about applicants, job listings, or any other queries.
            </div>
          </div>
          <div className="mt-4 flex flex-row items-center gap-2">
            <div className="relative flex-1">
              <textarea
                className="flex-1 w-full border border-[#E5E5E5] bg-[#F5F7FB] rounded-[22px] px-12 pt-3.5 pb-2.5 text-base outline-none resize-none leading-tight overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:overflow-hidden"
                placeholder="Ask about applicants"
                rows={1}
                style={{
                  minHeight: "48px",
                  maxHeight: "120px",
                }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const value = (
                      e.target as HTMLTextAreaElement
                    ).value.trim();
                    if (value) {
                      handleQueryApplications(value);

                      (e.target as HTMLTextAreaElement).value = "";

                      (e.target as HTMLTextAreaElement).style.height = "48px";
                    }
                  }
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height =
                    Math.min(target.scrollHeight, 120) + "px";
                }}
              />
              <img
                src={chatbot}
                alt=""
                className="absolute top-1/2 -translate-y-1/2 left-2"
              />
              <button
                onClick={() => handleQueryApplications(query)}
                disabled={isQueryLoading || !query.trim()}
                className={`absolute right-4 top-1/2 -translate-y-1/2  ${
                  isQueryLoading || !query.trim()
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer"
                }`}
              >
                <Send variant="Bold" size={24} color="#434448" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobApplicants;
