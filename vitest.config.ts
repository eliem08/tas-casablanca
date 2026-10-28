import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" paths so tests can import route
      // handlers and lib modules with the same specifiers the app uses.
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Exact-solver/property tests are CPU-heavy; vitest >= 4 parallel workers
    // hit the 5s default under load (timeouts, not logic failures).
    testTimeout: 60_000,
  },
});
