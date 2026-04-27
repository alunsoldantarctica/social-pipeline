import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "convex/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".astro/**"],
    environment: "node",
    globals: false,
    pool: "threads",
  },
});
