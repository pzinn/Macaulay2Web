import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify("test"),
    APP_MODE: JSON.stringify("full"),
  },
  test: {
    environment: "jsdom",
    include: ["src/client/**/*.test.ts"],
    globals: true,
  },
});
