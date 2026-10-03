import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": r("./src"), "server-only": r("./test/stubs/server-only.ts") } },
  test: { include: ["test/**/*.test.ts"], env: { AUTH_SECRET: "test-secret-0123456789abcdef", NODE_ENV: "test" } },
});
