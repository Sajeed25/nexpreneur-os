import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

/** True once DATABASE_URL points at a real MySQL server (not the deploy placeholder). */
export const hasDb = () => /^mysql:\/\//.test(process.env.DATABASE_URL ?? "");

const g = globalThis as unknown as { __db?: MySql2Database<typeof schema> };

export function db() {
  if (!hasDb()) throw new Error("DATABASE_URL is not configured");
  // Reuse one small pool per process (Hostinger plans have low connection limits).
  return (g.__db ??= drizzle(mysql.createPool({ uri: process.env.DATABASE_URL!, connectionLimit: 5 }), { schema, mode: "default" }));
}
export { schema };
