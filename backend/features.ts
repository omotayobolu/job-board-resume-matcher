const ENABLED = new Set(["1", "true", "on", "yes"]);

/** Job seeker product is off unless JOB_SEEKER_FEATURES is explicitly enabled. */
export function jobSeekerFeaturesEnabled(): boolean {
  const value = process.env.JOB_SEEKER_FEATURES?.trim().toLowerCase();
  return value !== undefined && ENABLED.has(value);
}
