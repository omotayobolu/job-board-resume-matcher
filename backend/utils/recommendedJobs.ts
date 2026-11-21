import pool from "../db";
import { matchPercent } from "./matchPercent";

type SeekerResume = {
  embedding: string | null;
  resume_processing_status: "pending" | "processing" | "completed" | "failed";
  resume_s3_key: string | null;
  has_parsed_resume: boolean;
};

type RecommendationBlock = {
  ready: false;
  status: "no_resume" | "processing" | "failed";
  reason: string;
};

type RecommendationReady = {
  ready: true;
  embedding: string;
};

type RecommendedJobRow = {
  id: string;
  job_title: string;
  job_description: string;
  summary: string | null;
  location: string;
  required_skills: string[];
  created_at: Date;
  work_type: string;
  job_status: string;
  similarity: number;
};

const SEEKER_RESUME_SQL = `
  SELECT embedding::text AS embedding,
         resume_processing_status,
         resume_s3_key,
         (parsed_resume IS NOT NULL) AS has_parsed_resume
  FROM job_seeker
  WHERE user_id = $1
`;

const RECOMMENDED_JOBS_SQL = `
  SELECT
    jobs.id,
    jobs.job_title,
    jobs.job_description,
    jobs.summary,
    jobs.location,
    COALESCE(jobs.required_skills, '{}') AS required_skills,
    jobs.created_at,
    jobs.work_type,
    jobs.job_status,
    GREATEST(0, 1 - (jobs.embedding <=> $1::vector)) AS similarity
  FROM jobs
  WHERE jobs.embedding IS NOT NULL
    AND jobs.job_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM applications
      WHERE applications.job_id = jobs.id
        AND applications.job_seeker_id = $2
    )
  ORDER BY jobs.embedding <=> $1::vector ASC, jobs.id ASC
  LIMIT $3 OFFSET $4
`;

function recommendationGate(profile: SeekerResume | undefined): RecommendationBlock | RecommendationReady {
  const hasResume = Boolean(
    profile && (profile.resume_s3_key || profile.has_parsed_resume || profile.embedding),
  );
  if (!profile || !hasResume) {
    return {
      ready: false,
      status: "no_resume",
      reason: "Upload a resume to see jobs recommended for you.",
    };
  }
  if (profile.embedding) {
    return { ready: true, embedding: profile.embedding };
  }
  if (profile.resume_processing_status === "failed") {
    return {
      ready: false,
      status: "failed",
      reason: "We could not process your resume. Retry processing to see recommendations.",
    };
  }
  if (profile.resume_processing_status === "completed") {
    return {
      ready: false,
      status: "processing",
      reason: "Your resume embedding is not ready yet.",
    };
  }
  return {
    ready: false,
    status: "processing",
    reason: "Your resume is still being processed. Recommendations will appear when it finishes.",
  };
}

async function loadSeekerResume(userId: string): Promise<SeekerResume | undefined> {
  const result = await pool.query<SeekerResume>(SEEKER_RESUME_SQL, [userId]);
  return result.rows[0];
}

async function findRecommendedJobs(input: {
  resumeEmbedding: string;
  jobSeekerId: string;
  limit: number;
  offset: number;
}): Promise<Array<RecommendedJobRow & { matchPercent: number }>> {
  const result = await pool.query<RecommendedJobRow>(RECOMMENDED_JOBS_SQL, [
    input.resumeEmbedding,
    input.jobSeekerId,
    input.limit,
    input.offset,
  ]);
  return result.rows.map((row) => {
    const similarity = Number(row.similarity);
    return { ...row, similarity, matchPercent: matchPercent(similarity) };
  });
}

export { recommendationGate, loadSeekerResume, findRecommendedJobs };
export type { SeekerResume };
