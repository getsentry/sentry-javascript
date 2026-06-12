import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/after-upload-deletion.config.js";

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/after-upload-deletion",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
