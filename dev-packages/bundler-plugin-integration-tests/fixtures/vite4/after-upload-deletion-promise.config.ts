import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { getSentryConfig } from "../configs/after-upload-deletion-promise.config.js";

const outDir = "out/after-upload-deletion-promise";

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: outDir,
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(getSentryConfig(outDir))],
});
