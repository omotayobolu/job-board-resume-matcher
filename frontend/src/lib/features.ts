const ENABLED = new Set(["1", "true", "on", "yes"]);

/** Job seeker pages stay in the repo and stay hidden unless this flag is on. */
export function jobSeekerFeaturesEnabled(): boolean {
  const value = import.meta.env.VITE_JOB_SEEKER_FEATURES?.trim().toLowerCase();
  return value !== undefined && ENABLED.has(value);
}
