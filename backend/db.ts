import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { requiredEnv } from "./env";

const pool = new Pool({
  connectionString: requiredEnv("DATABASE_URL"),
});
export default {
  query<T extends QueryResultRow = never>(
    text: string,
    params?: readonly unknown[]
  ): Promise<QueryResult<T>> {
    return pool.query<T>(text, params as unknown[] | undefined);
  },
};
