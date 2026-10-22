import { fileURLToPath } from "node:url";
import pandacss from "@pandacss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [pandacss(), react()],
  resolve: {
    alias: { "styled-system": fileURLToPath(new URL("./styled-system", import.meta.url)) },
  },
  server: { proxy: { "/api": "http://localhost:3000" }, allowedHosts: [".trycloudflare.com"] },
  preview: { proxy: { "/api": "http://localhost:3000" }, allowedHosts: [".trycloudflare.com"] },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
