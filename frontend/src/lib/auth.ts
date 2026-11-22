import { jobSeekerFeaturesEnabled } from "@/lib/features";
import type { UserType } from "@/store/userSlice";

/** Where a signed-in user belongs: their dashboard, or the profile form they still owe. */
export function getHomePath({
  role,
  hasprofile,
}: Pick<UserType, "role" | "hasprofile">): string {
  if (!role) return "/login";
  if (hasprofile) return "/dashboard";
  if (role === "recruiter") return "/recruiter-profile";
  if (jobSeekerFeaturesEnabled()) return "/jobseeker-profile";
  return "/dashboard";
}
