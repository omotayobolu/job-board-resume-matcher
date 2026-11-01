import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
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
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
  end(): Promise<void> {
    return pool.end();
  },
};
