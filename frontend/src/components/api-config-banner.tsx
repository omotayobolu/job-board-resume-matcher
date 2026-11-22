import { apiBaseUrlMissing } from "@/lib/axios-instance";

export function ApiConfigBanner() {
  if (!apiBaseUrlMissing) return null;

  return (
    <p
      role="status"
      className="fixed bottom-4 left-1/2 z-[60] w-[min(42rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-[#0D9488] bg-white px-4 py-3 text-center text-sm text-dark-grey shadow-sm"
    >
      VITE_API_URL is not set. Add it to frontend/.env. Requests are using /api/v1 on
      this origin until then.
    </p>
  );
}
