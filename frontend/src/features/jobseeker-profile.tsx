import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router";
import { useSelector } from "react-redux";
import { axiosInstance } from "@/lib/axios-instance";
import { getApiErrorMessage } from "@/lib/api-error";
import { selectUser } from "@/store/userSlice";
import { Button } from "@/components/ui/button";

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

const statusLabels: Record<JobSeekerProfile["resume_processing_status"], string> = {
  pending: "Waiting to process",
  processing: "Processing",
  completed: "Ready",
  failed: "Processing failed",
};

export default function JobSeekerProfilePage() {
  const user = useSelector(selectUser);
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["job-seeker-profile"],
    queryFn: async () => {
      const response = await axiosInstance.get<{ profile: JobSeekerProfile }>("/job-seeker/profile");
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
    return <main className="p-8" role="status">Loading your profile...</main>;
  }

  if (isError) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-semibold">Your profile</h1>
        <div className="mt-6 rounded-2xl bg-white p-6">
          <p role="alert" className="text-[#CC2424]">
            {getApiErrorMessage(error, "Could not load your profile. Please try again.")}
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
      <p className="mt-2 text-[#68707C]">Your details and the information found in your resume.</p>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm" aria-label="Profile details">
        <h2 className="text-2xl font-semibold text-[#212A37]">{data.full_name || "Job seeker"}</h2>
        {data.email && <p className="mt-1 text-[#68707C]">{data.email}</p>}
        <dl className="mt-6 grid gap-5 sm:grid-cols-2">
          <div><dt className="text-sm text-[#68707C]">Job title</dt><dd className="mt-1 font-medium">{data.job_title || "Not provided"}</dd></div>
          <div><dt className="text-sm text-[#68707C]">Location</dt><dd className="mt-1 font-medium">{data.location || "Not provided"}</dd></div>
          <div><dt className="text-sm text-[#68707C]">Work preference</dt><dd className="mt-1 font-medium">{data.remote_preference || "Not provided"}</dd></div>
          <div><dt className="text-sm text-[#68707C]">Member since</dt><dd className="mt-1 font-medium">{data.created_at ? new Date(data.created_at).toLocaleDateString() : "Not available"}</dd></div>
        </dl>
      </section>

      <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm" aria-label="Resume">
        <h2 className="text-xl font-semibold text-[#212A37]">Resume</h2>
        <dl className="mt-4 grid gap-5 sm:grid-cols-2">
          <div><dt className="text-sm text-[#68707C]">File</dt><dd className="mt-1 font-medium break-all">{data.resume_filename || "No file uploaded"}</dd></div>
          <div><dt className="text-sm text-[#68707C]">Status</dt><dd className="mt-1 font-medium">{statusLabels[data.resume_processing_status]}</dd></div>
        </dl>
        {data.resume_processing_status === "failed" && (
          <p className="mt-4 text-[#CC2424]">We could not process your resume. You can retry from the dashboard.</p>
        )}
        {!details && data.resume_processing_status !== "failed" && (
          <p className="mt-4 text-[#68707C]">Resume details will appear after processing finishes.</p>
        )}
      </section>

      {details && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm" aria-label="Extracted resume details">
          <h2 className="text-xl font-semibold text-[#212A37]">Resume details</h2>
          <dl className="mt-5 space-y-5">
            {details.professional_summary && <div><dt className="font-semibold">Summary</dt><dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">{details.professional_summary}</dd></div>}
            {details.skills && <div><dt className="font-semibold">Skills</dt><dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">{details.skills}</dd></div>}
            {details.years_of_experience && <div><dt className="font-semibold">Experience</dt><dd className="mt-1 text-[#4A4A4A]">{details.years_of_experience}</dd></div>}
            {details.education && <div><dt className="font-semibold">Education</dt><dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">{details.education}</dd></div>}
            {details.certifications && <div><dt className="font-semibold">Certifications</dt><dd className="mt-1 whitespace-pre-line text-[#4A4A4A]">{details.certifications}</dd></div>}
          </dl>
        </section>
      )}
    </main>
  );
}
