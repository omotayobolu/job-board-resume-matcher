import type { UserType } from "@/store/userSlice";

/** Where a signed-in user belongs: their dashboard, or the profile form they still owe. */
export function getHomePath({
  role,
  hasprofile,
}: Pick<UserType, "role" | "hasprofile">): string {
  if (!role) return "/login";
  if (hasprofile) return "/dashboard";
  return role === "recruiter" ? "/recruiter-profile" : "/jobseeker-profile";
}
