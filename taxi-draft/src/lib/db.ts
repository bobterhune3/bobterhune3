import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

type Shared = { pool?: pg.Pool; local?: Promise<PGlite> };
const shared: Shared = ((globalThis as typeof globalThis & { __taxiDb?: Shared }).__taxiDb ??= {});

export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

export async function tx<T>(fn: (query: Query) => Promise<T>): Promise<T> {
  if (databaseUrl !== "") {
    shared.pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    const client = await shared.pool.connect();
    const query: Query = async (text, params = []) => (await client.query(text, params)).rows;
    try {
      await client.query("begin");
      const result = await fn(query);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  await sql("begin");
  try {
    const result = await fn(sql);
    await sql("commit");
    return result;
  } catch (error) {
    await sql("rollback");
    throw error;
  }
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  if (databaseUrl !== "") {
    shared.pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await shared.pool.query(text, params)).rows as T[];
  }
  shared.local ??= startLocal().catch((error: unknown) => {
    shared.local = undefined;
    throw error;
  });
  return (await (await shared.local).query<T>(text, params)).rows;
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir("migrations").catch(() => [])).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
