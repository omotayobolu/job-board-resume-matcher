import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchRecommendedJobs, type RecommendedJob } from "@/lib/jobs-api";
import { Button } from "./ui/button";

function JobCard({ job }: { job: RecommendedJob }) {
  return (
    <article className="rounded-3xl border border-[#E5E5E5] bg-[#FAFAFA] p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-medium text-black">{job.job_title}</h3>
        <span className="shrink-0 rounded-full bg-purple px-3 py-1 text-sm font-medium text-white">
          {job.matchPercent}% match
        </span>
      </div>
      <p className="mt-2 text-sm text-[#4A4A4A]">
        {job.location}
        {job.work_type ? ` · ${job.work_type}` : ""}
      </p>
      <p className="mt-3 line-clamp-3 text-sm text-[#4A4A4A]">
        {job.summary?.trim() || job.job_description}
      </p>
      {job.required_skills?.length > 0 && (
        <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
          {job.required_skills.map((skill) => (
            <span
              key={skill}
              className="rounded-4xl bg-[#E5E5E5] px-3 py-1 text-sm text-black"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export default function RecommendedJobs() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["recommended-jobs"],
    queryFn: () => fetchRecommendedJobs(),
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 5000 : false,
  });

  return (
    <section
      className="mt-6 rounded-4xl border-2 border-[#E5E5E5] bg-white"
      aria-labelledby="recommended-heading"
    >
      <div className="px-8 pb-4 pt-6.5">
        <h2 id="recommended-heading" className="text-xl font-medium text-black">
          Recommended for you
        </h2>
      </div>
      <div className="border-b border-[#E5E5E5]" />
      <div className="px-8 py-6">
        {isLoading && (
          <p className="text-[#4A4A4A]" role="status">
            Loading recommendations...
          </p>
        )}
        {isError && (
          <p className="text-[#CC2424]" role="alert">
            Could not load recommendations. Please refresh this page.
          </p>
        )}
        {data?.status === "no_resume" && (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p>{data.reason}</p>
            <Link to="/dashboard/profile">
              <Button type="button" variant="primary">Upload a resume</Button>
            </Link>
          </div>
        )}
        {data?.status === "processing" && (
          <p role="status">{data.reason}</p>
        )}
        {data?.status === "failed" && (
          <p role="status">{data.reason}</p>
        )}
        {data?.status === "ready" && data.jobs.length === 0 && (
          <p>No open jobs match your resume right now.</p>
        )}
        {data?.status === "ready" && data.jobs.length > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {data.jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
