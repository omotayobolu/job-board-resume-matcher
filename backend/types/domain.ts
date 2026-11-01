export type Role = "recruiter" | "job_seeker";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role | null;
  hasprofile: boolean;
}

export interface JobRow {
  id: string;
  recruiter_id: string;
  job_title: string;
  job_description: string;
  location: string;
  required_skills: string[];
  job_status: string;
  work_type: string;
  summary: string | null;
  created_at: Date;
}

export interface ApplicationRow {
  id: string;
  job_id: string;
  job_seeker_id: string;
  status: "Applied" | "Interviewing" | "Hired" | "Rejected";
  score: number;
  applied_at: Date;
}

export interface RecruiterProfileRow {
  id: string;
  user_id: string;
  company_name: string;
  type_of_organization: string;
  location: string;
  created_at: Date;
}

export interface JobSeekerProfileRow {
  id: string;
  user_id: string;
  job_title: string;
  location: string;
  remote_preference: string;
  resume_s3_key: string | null;
  resume_filename: string | null;
  resume_processing_status: "pending" | "processing" | "completed" | "failed";
  resume_job_id: string | null;
  created_at: Date;
}

export interface JobDetails {
  job_title: string;
  job_description: string;
  location: string;
  required_skills: string[];
  work_type: string;
  job_status?: string;
  responsibilities?: string[];
}

export interface ResumeProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  professional_summary: string;
  years_of_experience: string;
  work_experience: Array<{
    title: string;
    company: string;
    location: string;
    start_date: string;
    end_date: string;
    responsibilities: string[];
    achievements: string[];
  }>;
  skills: string;
  certifications: string;
  education: string;
  projects: string[];
  languages: string[];
  links: string[];
  additional_sections: Array<{
    heading: string;
    content: string;
  }>;
}
