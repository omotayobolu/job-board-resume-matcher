# Shortlistly

Shortlistly is a recruiter CV screening tool. A hiring team adds a role, drops in CVs, and gets a ranked shortlist with a short reason for each person.

Job seeker pages stay in the repo but are off unless `VITE_JOB_SEEKER_FEATURES` is turned on. See `frontend/.env.example`.

```bash
npm install
npm run dev
```

The app runs at http://localhost:5173. Copy `frontend/.env.example` to `frontend/.env` and set `VITE_API_URL` to the API (for example `http://localhost:3000/api/v1`). If that variable is missing, the page still loads and requests go to `/api/v1` on the same origin.
