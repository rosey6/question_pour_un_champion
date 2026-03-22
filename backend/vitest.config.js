// vitest.config.js — configuration Vitest pour le projet CommonJS
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
