import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sri } from "vite-plugin-sri3";
import { resolve } from "node:path";
import { sentryConfig } from "../configs/sri-disable-upload.config.js";

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: "./out/sri-disable-upload",
    rollupOptions: {
      input: resolve("./src/sri.html"),
    },
  },
  plugins: [sri(), sentryVitePlugin(sentryConfig)],
});
