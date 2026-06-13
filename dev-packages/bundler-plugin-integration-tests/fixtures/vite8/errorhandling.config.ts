import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { getErrorHandlingConfig } from "../configs/errorhandling.config.js";

const FAKE_SENTRY_PORT = process.env.FAKE_SENTRY_PORT || "9876";

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/errorhandling",
        entryFileNames: "[name].js",
        format: "cjs",
      },
    },
  },
  plugins: [sentryVitePlugin(getErrorHandlingConfig(FAKE_SENTRY_PORT))],
});
