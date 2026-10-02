import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { hasDb } from "./config";
import * as schema from "./schema";

export { hasDb };

const g = globalThis as unknown as { __db?: MySql2Database<typeof schema> };

export function db() {
  if (!hasDb()) throw new Error("DATABASE_URL is not configured");
  // Reuse one small pool per process (Hostinger plans have low connection limits).
  return (g.__db ??= drizzle(mysql.createPool({ uri: process.env.DATABASE_URL!, connectionLimit: 5, timezone: "Z" }), { schema, mode: "default" }));
}
export { schema };
