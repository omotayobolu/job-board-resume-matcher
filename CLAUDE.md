# CLAUDE.md

This file guides Claude Code (claude.ai/code) when it works in this repository.

## Project

A job board with AI resume matching. Recruiters post jobs and review ranked applicants. Job seekers upload a resume and apply. Each application gets a match score: the cosine similarity between the resume embedding and the job embedding. Recruiters can also ask natural-language questions about a job's applicants (RAG over resume vectors).

The backend and frontend are two separate npm projects. There is no root `package.json`, so run every command from inside `backend/` or `frontend/`. `AGENTS.md` at the root holds a shorter version of this guide.

## Commands

```bash
# backend/ (Express 5, CommonJS, port 3000 hardcoded)
npm start            # node server.js
npm run dev          # nodemon server.js; nodemon is NOT in package.json, so install it globally

# frontend/ (Vite + React 19 + TS, port 5173)
npm run dev
npm run build        # tsc -b && vite build; use it as the type check
npm run lint         # eslint
```

There is no test suite: the backend `npm test` is a placeholder that exits 1. To verify frontend changes, run `npm run lint` and `npm run build`. To verify backend changes, exercise the endpoint by hand. Don't claim an end-to-end flow works unless Postgres, Pinecone, Cloudinary and OpenRouter were actually reachable.

## Environment

- `backend/.env`: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`, `CLIENT_ID` and `CLIENT_SECRET` (Google OAuth), `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `PINECONE_API_KEY`, `OPENROUTER_API_KEY`, `NODE_ENV`.
- `frontend/.env`: `VITE_API_URL`. It must include the `/api/v1` prefix, e.g. `http://localhost:3000/api/v1`.
- Never copy secret values into code, logs or docs.
- Some URLs are hardcoded outside `.env`:
  - `http://localhost:3000/auth/google/callback` appears in `backend/routes/google.js`, `backend/routes/oauth.js` and `frontend/src/features/login.tsx`.
  - `Access-Control-Allow-Origin: http://localhost:5173` is set in `google.js`.
  - Port 3000 is set in `server.js`.

  Update all of them when you change ports or deploy.

## Backend architecture (`backend/`)

- **`server.js`**: sets up JSON and urlencoded parsing, CORS (`FRONTEND_URL`, credentials on), cookie-parser and morgan. It mounts `routes/routes.js`, then the two Google OAuth routers at `/auth/google/callback`, then the error middleware. An `unhandledRejection` re-throws, which crashes the process on non-operational errors.
- **`routes/routes.js`**: mounts everything under `/api/v1`. All routes except `/auth` run `authenticateToken` at mount time:

  | Mount | Endpoints |
  |---|---|
  | `/auth` | `GET /check` (runs its own auth) |
  | `/user` | `GET /`, `PATCH /update-role` |
  | `/job-seeker` | `POST /create-profile` (multer memory upload, field `resume`) |
  | `/recruiter` | `POST /create-profile`, `POST /query-applications/:jobId` |
  | `/jobs` | `POST /create-job`, `GET /get-jobs`, `GET /get-jobs/:recruiterId`, `GET /get-job/:id`, `PATCH /update-job-status/:id`, `DELETE /delete-job/:id` |
  | `/applications` | `POST /apply`, `GET /:jobId` |
- **OAuth**:
  - `POST /auth/google/callback` (`google.js`) returns the Google consent URL.
  - `GET /auth/google/callback` (`oauth.js`) exchanges the code, upserts the `users` row, signs a 30-day JWT `{id, email, full_name, role}` into an httpOnly `token` cookie (`sameSite: Strict`), and redirects to `/dashboard` or `/select-role`.
  - `POST /auth/google/callback/logout` clears the cookie. The frontend doesn't call it yet.
- **`middlewares/authMiddleware.js`**:
  - `authenticateToken` verifies the cookie JWT and loads `req.user = {id, email, full_name, role}` from the DB.
  - `isRecruiter` checks `req.user.role === "recruiter"`.
- **Errors**: `utils/error-handler.js` exports `HttpStatusCode` and `CustomError(status, httpCode, message, isOperational)`.
  - Controllers should `throw new CustomError(...)` inside `try` and call `next(error)` in `catch`.
  - `errorHandlerMiddleware` shows the real message only when `isOperational` is true. Otherwise it responds with a generic 500.
  - Some handlers return `res.status(...).json({ error })` directly instead. Both styles exist.
- **`db.js`**: exports `{ query }` over a `pg` Pool. Always use parameterized `$1` queries. There is no ORM and there are no migrations.
- **`models/schema.sql`**: a pgAdmin snapshot, not a runnable migration. Its tables aren't in FK order. It needs `uuid-ossp` (`uuid_generate_v4`) and an `application_status` enum (`Applied | Interviewing | Hired | Rejected`) that the file never defines. Tables: `users`, `recruiter`, `job_seeker`, `jobs`, `applications`, `notifications`.

### AI / matching pipeline

- **Embeddings** (`utils/embed.js`): computed locally with `@xenova/transformers` and the `Xenova/all-mpnet-base-v2` model (768 dimensions, mean pooling, normalized). The model downloads on first use, and the pipeline is rebuilt on every call.
- **LLM calls**: go to OpenRouter (`openai/gpt-4-turbo`, temperature 0.2) via raw `fetch`. They happen in `utils/parseResume.js` (resume → JSON, job description → responsibilities and summary) and `recruiterController.queryApplications`.
- **Pinecone**: index `job-matching` (`config/pinecone.js`), which must be 768 dimensions.
  - Namespace `job_seeker`: vector id is the **user id**.
  - Namespace `job`: vector id is the **job id**.
- **Resume profile creation** runs synchronously before the response, in this order: extract text (PDF via `pdf-parse`, DOCX via `mammoth`; `.doc` isn't supported even though the UI accepts it) → LLM parse → embed → Pinecone upsert → Cloudinary raw upload (`resumes/…`) → insert `job_seeker` → set `users.hasprofile = true`. A failure partway through leaves earlier side effects in place.
- **Job creation**: inserts the row and responds right away. It then runs `processEmbeddings` fire-and-forget: LLM parse → embed → upsert to the `job` namespace.
- **Apply**: inserts the application with `score = 0` and responds. It then runs `processApplication` fire-and-forget: fetch both vectors → cosine similarity → update `score` → refresh the recruiter's single "Top Match!" notification. The score shows up later and stays 0 if the job vector wasn't upserted yet.
- **Recruiter Q&A**: embeds the question → queries the `job_seeker` namespace with topK 10 → keeps only matches that applied to `:jobId` → puts their metadata into the prompt → returns `{ answer }`.

## Frontend architecture (`frontend/src/`)

- **Stack**: React 19, `react-router` v7 (declarative `<Routes>`), Redux Toolkit for the current user, TanStack Query for server data, react-hook-form, axios, Tailwind v4, shadcn/ui (`components/ui/`, added via `npx shadcn@latest add`), and `sonner` toasts. Icons come from `iconsax-reactjs` and `lucide-react`. The `@/` alias points to `src/`.
- **`App.tsx` routes**:
  - Public: `/` (Redirect, shows the landing page when logged out), `/login` (`features/sign-in.tsx`) and `/signup` (`features/sign-up.tsx`, which collects the role).
  - Behind `ProtectedRoute`: `/recruiter-profile`, `/jobseeker-profile`, and `/dashboard`.
  - `/dashboard` uses `DashboardLayout` and has children: index, `applicants/:jobId`, `messages`, `messages/:userId`.
- **`features/protected-route.tsx`**: calls `/auth/me` on mount and runs the onboarding state machine:
  - no role → `/login`
  - role but no profile (`hasprofile`) → the matching profile page
  - otherwise → `/dashboard`
- **`features/dashboard.tsx`**: picks `recruiter-dashboard` or `jobseeker-dashboard` by `user.role`.
- **`store/userSlice.ts`**: holds `fetchUser` (`GET /user`), `setUser`, `clearUser` and `selectUser`. `App` dispatches `fetchUser` on load.
- **`lib/jobs-api.ts`**: shared `Job` and `Applicants` types plus fetchers. Other components call `axiosInstance` inline.
- **React Query keys**: `["jobs"]` (seeker job list), `["recruiterJobs", user.id]` and `["applicants", jobId]`. Invalidate the matching key after mutations, as `post-job-dialog.tsx` does.
- **All API calls** go through `axiosInstance` (`lib/axios-instance.ts`), which sets `baseURL` from `VITE_API_URL` and `withCredentials: true`, so call sites use paths like `"/jobs/get-jobs"`. `getApiErrorMessage` (`lib/api-error.ts`) turns a failed request into a user-facing message. The cookie is the only auth mechanism; there are no Authorization headers.
- **`features/messages.tsx`**: UI only. No backend or messaging tables exist yet.
- **`features/applicants.tsx`** (~590 lines): the recruiter's applicant table, job status toggle, job delete and the Q&A chatbot.

## Conventions

- **Contract**: keep these names identical across SQL, controllers, `jobs-api.ts` types and components:
  - snake_case API fields (`job_title`, `required_skills`, `job_seeker_id`, `applicants_count`, `top_match`)
  - lowercase Postgres aliases (`hasapplied`, `hasprofile`)
  - role strings, exactly `"recruiter"` and `"job seeker"` (with the space)
- **Backend style**: CommonJS `require`, 2-space indentation, semicolons, async controllers with `try/catch → next(error)`.
- **Frontend style**: strict TS, function components, kebab-case filenames. Pages go in `features/`; shared pieces go in `components/`.
- **Ownership checks**: `authenticateToken` + `isRecruiter` only proves the role. For job or application endpoints, also check that the resource belongs to `req.user.id`, as `deleteJob` and `updateJobStatus` do with `AND recruiter_id = $2`.
- **Fire-and-forget work**: background steps run after `res` is sent. Never call `next()` or `res` inside them. Log the error instead.
- **Lockfiles**: keep both. Don't commit `.env`, `node_modules` or `backend/logs/`.

## Known issues (verify before relying on them; fix when touching nearby code)

- `applyToJob` selects only `id` from `jobs` but then reads `recruiter_id`, so it's `undefined`. As a result, top-match notifications never update. `updateHighestMatchNotification` also reads `job.job_title` from a query that selects only `id`.
- The match score is cosine similarity in the range 0–1, but the notification text treats it as a percentage (`Math.round(score)%`, `score > 60`).
- `parseJobDescription` returns a `summary`, but nothing writes it to `jobs.summary`, so the frontend's `summary` is always null.
- `processEmbeddings` calls `next(error)` in its catch block, but `next` isn't in scope.
- `PATCH /user/update-role` takes `email` from the request body, so any logged-in user can change any user's role. It should use `req.user`.
- No ownership check on `GET /applications/:jobId`, `GET /jobs/get-jobs/:recruiterId` or `POST /recruiter/query-applications/:jobId`: any recruiter can read another recruiter's data.
- On error, the OAuth callback calls both `next(error)` and `res.redirect`, which sends headers twice.
