import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify("test"),
    MINIMAL: "false",
  },
  test: {
    environment: "jsdom",
    include: ["src/client/**/*.test.ts"],
    globals: true,
  },
});
