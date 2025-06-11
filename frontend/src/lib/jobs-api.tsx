import axios from "axios";

interface Job {
  id: string;
  recruiter_id: string;
  job_title: string;
  location: string;
  work_type: string;
  job_description: string;
  job_status: string;
  required_skills: string[];
  created_at: string;
}

export const fetchRecruiterJobs = async (
  recruiterId: string
): Promise<Job[]> => {
  try {
    const response = await axios.get(
      `${import.meta.env.VITE_API_URL}/jobs/get-jobs/${recruiterId}`,
      { withCredentials: true }
    );
    return response.data.jobs;
  } catch (error) {
    console.error("Error fetching recruiter jobs:", error);
    throw error;
  }
};
