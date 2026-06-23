import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/telemetry.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/telemetry",
        entryFileNames: "[name].js",
      },
    },
    // We already delete the directory and don't want our telemetry file to be deleted
    emptyOutDir: false,
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
