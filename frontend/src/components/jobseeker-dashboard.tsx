import { Link } from "react-router";
import { Button } from "./ui/button";
import { useQuery } from "@tanstack/react-query";
import { fetchJobs, type Job } from "@/lib/jobs-api";
import { useState, type JSX } from "react";
import { formatDistanceToNow } from "date-fns";
import axios from "axios";
import { toast } from "sonner";

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  return formatDistanceToNow(date, { addSuffix: true });
};

const JobseekerDashboard = () => {
  const {
    data: jobs,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["jobs"],
    queryFn: () => fetchJobs(),
  });
  console.log(jobs);
  const [selectedJob, setSelectedJob] = useState(jobs ? jobs[0] : null);
  const [applying, setApplying] = useState(false);

  const handleJobSelect = (job: Job) => {
    setSelectedJob(job);
  };

  const formatJobDescription = (description: string): JSX.Element[] => {
    const keywords = [
      "responsibilities",
      "qualifications",
      "key responsibilities",
    ];
    const regex = new RegExp(`(${keywords.join("|")})`, "gi");

    return description.split(regex).map((part, index) => {
      if (
        keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase())
      ) {
        return (
          <strong
            key={index}
            className="block mt-4 mb-2 text-black font-medium"
          >
            {part}
          </strong>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  const applyToJob = async (jobId: string) => {
    setApplying(true);
    try {
      const response = await axios.post(
        `${import.meta.env.VITE_API_URL}/applications/apply`,
        {
          jobId,
        },
        {
          withCredentials: true,
        }
      );
      if (response.status === 201) {
        toast.success(response.data.message);
        setApplying(false);
      }
    } catch (error) {
      console.error("Error applying to job:", error);
      toast.error("Failed to apply to job. Please try again.");
      setApplying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-[#4A4A4A]">Loading jobs...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-lg text-[#CC2424]">
          Error loading jobs:{" "}
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div className="py-18 px-6">
      <div className="flex flex-row gap-6 items-stretch w-full">
        <div className="w-[65%]">
          <div className="border border-black rounded-4xl bg-[#6E62E5] p-8">
            <h2 className="text-2xl font-bold text-white font-sf-pro">
              Elevate Yor Application!
            </h2>
            <p className="mt-6 font-medium text-lg text-white">
              Want to stand out to recruiters? Learn how to optimize your
              profile and applications on our platform, using insights into what
              makes a "Top Match" based on skills, tools, and experience.
            </p>
            <div className="mt-4 flex flex-row justify-end items-center gap-4">
              <Link
                to="https://www.indeed.com/career-advice/resumes-cover-letters/how-to-make-a-resume-with-examples"
                target="_blank"
              >
                <Button variant="outline" className="py-3 px-6 rounded-3xl ">
                  Get tips
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <div className="border-2 border-[#E5E5E5] bg-white w-[35%] pb-10 p-8 rounded-4xl flex-grow">
          <div className="flex flex-row items-center gap-3 ">
            <div className="w-16 h-16 bg-black rounded-full flex-shrink-0"></div>
            <div className="flex flex-col gap-2">
              <h3 className="text-black text-xl font-medium">Ayoade Subomi</h3>
              <p className="text-black  font-normal truncate text-ellipsis w-full max-w-3/4">
                Product Designer | Software Engineer
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Link to="" className="text-[#6E62E5] underline underline-offset-2">
              Complete Your Profile
            </Link>
            <div className="mt-5 flex flex-row items-center gap-2">
              <div className="bg-[#E5E5E5] rounded-[12px] h-4 relative w-full">
                <div className="absolute top-0 left-0 bg-[#7D67F4] h-4 w-full rounded-[12px]"></div>
              </div>
              <p className="text-sm">100%</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-row items-start gap-6">
        <div className="border-2 border-[#E5E5E5] rounded-4xl bg-white w-[65%]">
          <div className="pt-6.5 pb-4 px-8">
            <h4 className="text-xl text-black font-medium">
              Jobs You Might Be Interested In
            </h4>
          </div>
          <div className="border-b border-[#E5E5E5]"></div>
          {jobs &&
            jobs.length > 0 &&
            jobs.map((job) => (
              <div
                key={job.id}
                className="py-5 px-8 border-b border-[#E5E5E5] cursor-pointer"
                onClick={() => handleJobSelect(job)}
              >
                <span className="text-sm text-[#4A4A4A] font-normal">
                  Posted {formatRelativeTime(job.created_at)}
                </span>
                <h2 className="text-xl font-medium mt-2">{job.job_title}</h2>
                <p className="mt-5 text-[#4A4A4A] line-clamp-2">
                  {job.job_description}
                </p>
                <div className="mt-5 flex flex-row flex-wrap items-center gap-2">
                  {job.required_skills.map((skill) => (
                    <span className="bg-[#E5E5E5] text-black text-sm font-normal px-4 py-1 rounded-4xl">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
        <div className="w-[35%] border-2 border-[#E5E5E5] rounded-4xl bg-white">
          {selectedJob ? (
            <div key={selectedJob.id}>
              <div className="pt-6.5 pb-4 px-8">
                <h4 className="text-xl text-black font-medium">
                  {selectedJob.job_title}
                </h4>
              </div>
              <div className="border-b border-[#E5E5E5]"></div>
              <div className="my-5 px-8">
                <span className="text-sm text-[#4A4A4A] font-normal">
                  Posted {formatRelativeTime(selectedJob.created_at)}
                </span>
                <p className="mt-5 text-[#4A4A4A] text-sm max-h-[300px] overflow-y-auto">
                  {formatJobDescription(selectedJob.job_description)}
                </p>
                <div className="mt-5 flex flex-row flex-wrap items-center gap-2">
                  {selectedJob.required_skills.map((skill) => (
                    <span className="bg-[#E5E5E5] text-black text-sm font-normal px-4 py-1 rounded-4xl">
                      {skill}
                    </span>
                  ))}
                </div>
                <div className="my-10 mx-auto w-full text-right">
                  <Button
                    variant={
                      selectedJob.hasapplied || applying ? "ghost" : "primary"
                    }
                    className="text-right py-4 px-15 text-base font-medium "
                    onClick={() => applyToJob(selectedJob.id)}
                  >
                    {applying
                      ? "Applying..."
                      : selectedJob.hasapplied
                      ? "Applied"
                      : "Apply"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-[#4A4A4A] py-6">
                Select a job to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default JobseekerDashboard;
