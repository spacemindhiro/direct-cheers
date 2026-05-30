import { defineConfig } from "vitest/config";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    environment: "node",
    singleFork: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ["__tests__/**/*.test.ts"],
    globals: true,
    sequence: {
      shuffle: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
