import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // Against a shared real database, test files must not run concurrently.
    fileParallelism: !process.env.TEST_DATABASE_URL,
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: { NODE_ENV: "test" },
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/server/**"],
      reporter: ["text-summary", "lcov"],
    },
  },
});
