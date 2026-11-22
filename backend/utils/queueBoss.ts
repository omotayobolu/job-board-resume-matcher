import type { PgBoss } from "pg-boss" with { "resolution-mode": "import" };
import { requiredEnv } from "../env";
import { errorHandler } from "./error-handler";

// One process-wide pg-boss. Resume, job-embedding, and screening workers share it.
let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export const queuePolicy = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 30 * 60,
  heartbeatSeconds: 60,
} as const;

export function getQueueBoss(): PgBoss {
  if (!boss) throw new Error("Queue is not ready");
  return boss;
}

export async function startQueueBoss(): Promise<PgBoss> {
  if (boss) return boss;
  if (!starting) {
    starting = createBoss().then((instance) => {
      boss = instance;
      return instance;
    }).catch((error: unknown) => {
      starting = null;
      throw error;
    });
  }
  return starting;
}

async function createBoss(): Promise<PgBoss> {
  const { PgBoss } = await import("pg-boss");
  const instance = new PgBoss({ connectionString: requiredEnv("DATABASE_URL") });
  instance.on("error", (error) => errorHandler.handleError(error));
  await instance.start();
  return instance;
}

export async function stopQueueBoss(): Promise<void> {
  const current = boss;
  boss = null;
  starting = null;
  if (current) await current.stop();
}
