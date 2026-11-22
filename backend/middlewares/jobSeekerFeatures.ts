import type { Request, Response, NextFunction } from "express";
import { jobSeekerFeaturesEnabled } from "../features";

function endsWithRoute(path: string, route: string): boolean {
  return path === route || path.endsWith(route);
}

/** Public job list, recommendations, and apply. Recruiter job routes stay available. */
export function isHiddenJobSeekerRoute(req: Request): boolean {
  const path = req.path;
  if (req.method === "GET") {
    if (path.includes("/get-jobs/")) return false;
    if (endsWithRoute(path, "/get-jobs") || endsWithRoute(path, "/recommended")) return true;
  }
  if (req.method === "POST" && endsWithRoute(path, "/apply") && !path.includes("/apply/")) return true;
  return false;
}

export function blockJobSeekerFeatures(_req: Request, res: Response, next: NextFunction): void {
  if (!jobSeekerFeaturesEnabled()) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  next();
}

export function blockHiddenJobRoutes(req: Request, res: Response, next: NextFunction): void {
  if (!jobSeekerFeaturesEnabled() && isHiddenJobSeekerRoute(req)) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  next();
}
