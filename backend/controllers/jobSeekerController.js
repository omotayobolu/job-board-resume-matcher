const { HttpStatusCode, CustomError } = require("../utils/error-handler");
const pool = require("../db");
const path = require("path");
const { cloudinary } = require("../config/cloudinary");
const streamifier = require("streamifier");
const extractText = require("../utils/extractResumeText");
const { parseResumeText } = require("../utils/parseResume");
const { embedResume } = require("../utils/embed");
const index = require("../config/pinecone");

const createProfile = async (req, res, next) => {
  const { job_title, location, remote_preference } = req.body;
  const user_id = req.user.id;
  try {
    if (!user_id) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "User ID is required.",
        true
      );
    }
    const resumeText = await extractText(req.file.buffer, req.file.mimetype);
    const parsedResume = await parseResumeText(resumeText);
    const embedding = await embedResume(parsedResume);

    const vector = {
      id: String(user_id),
      values: Array.from(embedding),
      metadata: {
        type: "resume",
        name: parsedResume.name || "unknown",
        experience_years: parsedResume.years_of_experience || "",
        skills: parsedResume.skills || "",
        education: parsedResume.education || "",
        certifications: parsedResume.certifications || "",
        job_experience_details:
          JSON.stringify(
            parsedResume.work_experience?.map((exp) => ({
              jobTitle: exp.title || "",
              company: exp.company || "",
              responsibilities: exp.responsibilities || [],
            }))
          ) || [],
      },
    };

    await index.namespace("job_seeker").upsert([vector]);

    const streamUpload = (buffer, originalname) => {
      return new Promise((resolve, reject) => {
        const ext = originalname.split(".").pop();
        const baseName = originalname.replace(/\.[^/.]+$/, "");
        const publicId = `resumes/${baseName}_${Date.now()}.${ext}`;
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw",
            public_id: publicId,
            use_filename: false,
            unique_filename: false,
            overwrite: true,
          },
          (error, result) => {
            if (result) resolve(result);
            else reject(error);
          }
        );
        streamifier.createReadStream(buffer).pipe(stream);
      });
    };

    const resume = await streamUpload(req.file.buffer, req.file.originalname);

    if (!user_id || !job_title || !location || !remote_preference || !resume) {
      throw new CustomError(
        "BAD REQUEST",
        HttpStatusCode.BAD_REQUEST,
        "User Id and other fields are required!",
        true
      );
    }

    const userCheck = await pool.query(
      "SELECT id, role FROM users WHERE id = $1",
      [user_id]
    );
    if (userCheck.rowCount === 0) {
      throw new CustomError(
        "NOT FOUND",
        HttpStatusCode.NOT_FOUND,
        "User not found",
        true
      );
    }

    const user = userCheck.rows[0];

    if (user.role === "recruiter") {
      throw new CustomError(
        "UNAUTHORIZED",
        HttpStatusCode.UNAUTHORIZED,
        "A recruiter cannot create a job seeker profile.",
        true
      );
    }

    const result = await pool.query(
      "INSERT INTO job_seeker (user_id, job_title, location, remote_preference, resume_url, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
      [user_id, job_title, location, remote_preference, resume.secure_url]
    );

    await pool.query("UPDATE users SET hasprofile = true WHERE id = $1", [
      user_id,
    ]);

    const jobSeeker = result.rows[0];

    res
      .status(HttpStatusCode.CREATED)
      .json({ jobSeeker, message: "Profile created successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = { createProfile };
