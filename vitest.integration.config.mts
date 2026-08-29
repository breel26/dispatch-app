import { defineConfig } from "vitest/config";
import path from "path";

// Separate config so `npm test` (the default, run constantly, no DB
// needed) and `npm run test:integration` (needs a real DATABASE_URL)
// stay cleanly separated. Run this one manually or in CI with a real
// Postgres service available.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
