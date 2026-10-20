import { TickCircle } from "iconsax-reactjs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { useSelector } from "react-redux";
import { selectUser } from "@/store/userSlice";
import { useQuery } from "@tanstack/react-query";
import { fetchRecruiterJobs } from "@/lib/jobs-api";
import { Badge } from "./ui/badge";
import { useNavigate } from "react-router";

const formatDate = (dateString: string): string => {
  if (!dateString) return "";
  const date = new Date(dateString);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

function capitalizeFirstLetter(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const RecruiterDashboard = () => {
  const user = useSelector(selectUser);
  const navigate = useNavigate();

  const {
    data: jobs,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["recruiterJobs", user.id],
    queryFn: () => fetchRecruiterJobs(user.id),
    enabled: !!user.id,
  });

  const handleRowClick = (jobId: string) => {
    navigate(`/dashboard/applicants/${jobId}`);
  };

  return (
    <div className="py-18 px-6">
      <div className="flex flex-row gap-6">
        <div className="w-[70%] ">
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Date Posted</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applicants</TableHead>
                  <TableHead>Top Match(%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-red-500 py-4"
                    >
                      Error fetching jobs:{" "}
                      {error instanceof Error
                        ? error.message
                        : "An unknown error occurred"}
                    </TableCell>
                  </TableRow>
                ) : jobs && jobs.length > 0 ? (
                  jobs.map((job) => (
                    <TableRow
                      key={job.created_at}
                      onClick={() => {
                        handleRowClick(job.id);
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell>{job.job_title}</TableCell>
                      <TableCell>{formatDate(job.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="active">
                          <TickCircle
                            variant="Bold"
                            size="18"
                            color="#1D4C23"
                          />
                          {capitalizeFirstLetter(job.job_status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{job.applicants_count}</TableCell>
                      <TableCell>
                        {job.top_match ? (job.top_match * 100).toFixed(2) : 0}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      No jobs posted
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="w-[28%]">
          <div className="max-h-[414px] h-auto overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl p-8 bg-white">
            <h2 className="text-black text-2xl font-semibold">Notifications</h2>
            <p className="mt-6.5 text-sm text-[#4A4A4A]">
              No notifications yet.
            </p>
          </div>
          <div className="mt-6 max-h-[403px] h-auto overflow-y-auto border-2 border-[rgba(229,229,229,1)] rounded-4xl p-8 bg-white">
            <h2 className="text-black text-2xl font-semibold">Messages</h2>
            <p className="mt-7.5 text-sm text-[#4A4A4A]">No messages yet.</p>
          </div>
          {/* <div className="mt-6.5 py-4 px-8 border-2 border-[rgba(229,229,229,1)] rounded-4xl bg-white">
            <h2 className="text-black text-2xl font-semibold">AI Chatbot</h2>
            <div className="mt-6 relative">
              <Input
                type="text"
                className="rounded-[26px] pl-15"
                placeholder="Ask.."
              />
              <div className="absolute top-1/2 -translate-y-1/2 left-4">
                <img src={chatbot} alt="" />
              </div>
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default RecruiterDashboard;
