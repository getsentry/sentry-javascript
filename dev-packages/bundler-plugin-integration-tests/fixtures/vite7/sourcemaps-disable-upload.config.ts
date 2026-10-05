import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/sourcemaps-disable-upload.config.js";

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/dynamic-import.js",
      output: {
        dir: "out/sourcemaps-disable-upload",
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
