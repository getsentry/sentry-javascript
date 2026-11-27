import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sri } from "vite-plugin-sri3";
import { resolve } from "node:path";
import { sentryConfig } from "../configs/sri-upload.config.js";

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: "./out/sri-upload-sentry-first",
    rollupOptions: {
      input: resolve("./src/sri.html"),
    },
  },
  plugins: [sentryVitePlugin(sentryConfig), sri()],
});
