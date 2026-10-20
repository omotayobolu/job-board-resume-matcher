import axios from "axios";

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";
const NETWORK_MESSAGE =
  "Can't reach the server. Check your connection and try again.";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Turns a failed request into a message that is safe to show a user.
 * Handles the backend's `{ error }` and `{ error, details: [{ message }] }` shapes.
 */
export function getApiErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_MESSAGE
): string {
  if (!axios.isAxiosError(error)) return fallback;
  if (!error.response) return NETWORK_MESSAGE;

  const data: unknown = error.response.data;
  if (!isRecord(data)) return fallback;

  if (Array.isArray(data.details)) {
    const messages = data.details.flatMap((detail: unknown) =>
      isRecord(detail) && typeof detail.message === "string"
        ? [detail.message]
        : []
    );
    if (messages.length > 0) return messages.join("\n");
  }

  return typeof data.error === "string" && data.error ? data.error : fallback;
}
