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
    // These talk to a real database, so DATABASE_URL has to be loaded the
    // same way the app loads it. Without this the suite fails with an
    // opaque connection error rather than saying what is missing.
    setupFiles: ["dotenv/config"],
    // Overlap and PO-number tests intentionally contend for the same rows;
    // running files in parallel would have them fighting each other rather
    // than testing the constraints.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
