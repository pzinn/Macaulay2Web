import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/client/**/*.test.ts"],
    globals: true,
  },
});
