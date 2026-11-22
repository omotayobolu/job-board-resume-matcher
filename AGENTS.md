# Project guide

This repository is a job board with separate `backend/` and `frontend/` npm projects. Recruiters create jobs and review applicants; job seekers upload a resume and apply. The API stores application data in PostgreSQL, resume files in Cloudinary, and job/resume embeddings in Pinecone. OpenRouter is used to parse text and answer recruiter questions.

## Repository map

- `backend/server.ts` starts the Express server on port 3000 by default, configures CORS/cookies, and mounts the routers. `backend/routes/routes.ts` mounts authenticated routes under `/api/v1`; `backend/routes/authRoute.ts` exposes email/password registration, login, logout, and session checks.
- `backend/controllers/` contains the business logic for users, profiles, jobs, applications, and recruiter resume questions. `backend/middlewares/authMiddleware.ts` reads the `token` cookie, verifies the JWT, and loads the current user from PostgreSQL. `backend/db.ts` exports a typed `pg` query wrapper. `backend/schemas.ts` validates request and OpenRouter data at runtime; `backend/types/` holds shared types.
- `backend/models/setup.sql` initializes an empty PostgreSQL database in foreign key order and defines the `application_status` enum. Apply `backend/models/20261019_add_password_hash.sql` and `backend/models/20261019_normalize_user_roles.sql` once to an existing database before using password authentication. `backend/models/schema.sql` is the original schema snapshot, not a runnable setup script: its tables are out of dependency order and it does not define that enum.
- `backend/utils/` handles document text extraction, OpenRouter parsing, local transformer embeddings, vector retrieval, match scoring, and error logging. `backend/config/` configures Cloudinary and the Pinecone `job-matching` index.
- `frontend/src/App.tsx` defines the routes. `frontend/src/features/` contains login, onboarding, dashboard pages, applicant views, and messages. `frontend/src/components/` contains dashboards, sidebars, the post-job dialog, and reusable UI controls.
- `frontend/src/store/` holds Redux user state. `frontend/src/lib/jobs-api.ts` holds shared job/applicant requests and types. React Query owns the job and applicant query caches. `frontend/src/index.css` and Tailwind CSS v4 provide styling; `@/` aliases `frontend/src/`.

## Local setup and checks

Use the two package directories separately; there is no root `package.json` or root npm script.

```sh
cd backend && npm ci && npm run build && npm start
cd frontend && npm ci && npm run dev
```

Run the frontend checks from `frontend/` with `npm run lint` and `npm run build`. From `backend/`, run `npm run typecheck`, `npm test`, and `npm run build`; `npm run dev` uses `tsx watch` and runs the TypeScript source. `npm start` runs compiled `dist/server.js`, so build first. For backend changes, use focused manual/API verification as appropriate. Do not report an end-to-end flow as verified unless PostgreSQL and the required external services were available.

The frontend defaults to Vite's development port 5173. Its `VITE_API_URL` must be the API base including `/api/v1`, for example `http://localhost:3000/api/v1`. The backend needs `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PINECONE_API_KEY`, and `OPENROUTER_API_KEY`. Keep actual values in the ignored `backend/.env` and `frontend/.env`; never copy credentials into code, logs, or this file.

For a new database, run `backend/models/setup.sql` with `psql -v ON_ERROR_STOP=1 -f backend/models/setup.sql` from the repository root after connecting to the intended PostgreSQL database. This script creates tables but does not seed users or perform later schema migrations.

## Data and request flow

1. Email/password registration requires the exact role `recruiter` or `job_seeker` and creates a `users` row with a scrypt password hash. Login sets an HTTP-only `token` cookie containing a signed JWT. Authenticated frontend API calls use `withCredentials: true`; backend CORS uses `FRONTEND_URL` and allows credentials. Existing OAuth-only users have no password hash and need a separate password migration or reset before they can log in.
2. Users then create the profile matching their role. The role selection page remains for older accounts without a role. Job seeker profile creation sends multipart field `resume` and accepts PDF or DOCX in the backend extractor; the UI currently also advertises `.doc`, which the extractor does not support.
3. Job creation writes to PostgreSQL and responds before its asynchronous OpenRouter parsing, transformer embedding, and Pinecone upsert finish. Resume profile creation extracts and parses text, embeds it, upserts to Pinecone namespace `job_seeker`, uploads the file to Cloudinary, then saves the profile.
4. Applying creates an `applications` row and responds before asynchronous vector fetch and cosine match scoring finish. A new score can therefore appear later than the application. Job vectors use namespace `job`; resume vectors use `job_seeker` and are keyed by the user's ID.
5. The recruiter applicants view queries applications for a job. The recruiter question endpoint embeds a question, queries Pinecone, filters the results to applicants for that job, and asks OpenRouter for an answer.

Keep API field names (`job_title`, `required_skills`, `job_seeker_id`, `hasprofile`, etc.), role strings, route paths, and React Query keys in sync across SQL, controllers, frontend types, and views. Use parameterized PostgreSQL queries and the existing cookie auth middleware when adding endpoints. Check ownership and role authorization for any job or application operation; being authenticated alone does not establish ownership. When changing profile, job, or application flows, consider partial failures across PostgreSQL, Cloudinary, Pinecone, and asynchronous work.

## Editing conventions

- Backend files are strict TypeScript compiled to CommonJS, generally formatted with two-space indentation and semicolons. Parse untrusted request bodies and external JSON with schemas before using typed values. New route handlers should pass errors to the shared error middleware and use `HttpStatusCode`/`CustomError` where suitable.
- Frontend files are strict TypeScript/TSX with React functional components. Follow the existing forms (`react-hook-form`), API calls (`axios` with credentials), user state (Redux), server state (React Query), and UI primitives in `frontend/src/components/ui/`.
- Preserve the separate package lockfiles when changing dependencies. Avoid committing generated output, `node_modules`, logs, or `.env` files.
- The working tree may contain user changes. Inspect `git status` and relevant diffs before editing; do not discard unrelated changes.
