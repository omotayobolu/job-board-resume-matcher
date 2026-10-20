import { axiosInstance } from "@/lib/axios-instance";

export type Job = {
  id: string;
  recruiter_id: string;
  job_title: string;
  location: string;
  work_type: string;
  job_description: string;
  job_status: string;
  required_skills: string[];
  created_at: string;
  hasapplied?: boolean;
  applicants_count?: number;
  top_match?: number;
  summary: string;
};

export type Applicants = {
  id: string;
  job_seeker_id: string;
  job_id: string;
  job_seeker_name: string;
  score: number;
  status: string;
  applied_at: string;
};

export const fetchJobs = async (): Promise<Job[]> => {
  try {
    const response = await axiosInstance.get("/jobs/get-jobs");
    return response.data.jobs;
  } catch (error) {
    console.error("Error fetching jobs:", error);
    throw error;
  }
};

export const fetchRecruiterJobs = async (
  recruiterId: string
): Promise<Job[]> => {
  try {
    const response = await axiosInstance.get(`/jobs/get-jobs/${recruiterId}`);
    return response.data.jobs;
  } catch (error) {
    console.error("Error fetching recruiter jobs:", error);
    throw error;
  }
};

export const fetchApplicantsByJobId = async (
  jobId: string
): Promise<Applicants[]> => {
  console.log(`Fetching applicants for job ID: ${jobId}`);
  try {
    const response = await axiosInstance.get(`/applications/${jobId}`);
    console.log(response);
    return response.data.applications;
  } catch (error) {
    console.error("Error fetching applicants:", error);
    throw error;
  }
};
