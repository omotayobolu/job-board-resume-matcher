import axios from "axios";

const configured = import.meta.env.VITE_API_URL?.trim();

/** True when the frontend was built without VITE_API_URL. */
export const apiBaseUrlMissing = !configured;

// Same-origin /api/v1 matches the Express mount, so a missing env var does not
// blank the app. Set VITE_API_URL in frontend/.env for a separate API host.
export const apiBaseUrl = configured || "/api/v1";

if (apiBaseUrlMissing) {
  console.error(
    "VITE_API_URL is not set. Add it to frontend/.env (for example http://localhost:3000/api/v1). API requests are using /api/v1 on this origin until then.",
  );
}

/** Bound hung requests so a down API cannot leave the auth check spinning. */
export const API_TIMEOUT_MS = 15_000;

// The httpOnly cookie is the only auth mechanism, so every request sends credentials.
export const axiosInstance = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  timeout: API_TIMEOUT_MS,
});

// CV and resume uploads can outlast a session check. Leave those unbounded.
axiosInstance.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    config.timeout = 0;
  }
  return config;
});
