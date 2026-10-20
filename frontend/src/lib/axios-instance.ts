import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  throw new Error("VITE_API_URL is not set. Add it to frontend/.env.");
}

// The httpOnly cookie is the only auth mechanism, so every request sends credentials.
export const axiosInstance = axios.create({
  baseURL,
  withCredentials: true,
});
