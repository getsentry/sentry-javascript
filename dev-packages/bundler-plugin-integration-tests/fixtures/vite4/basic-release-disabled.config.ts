import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/basic-release-disabled.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/basic-release-disabled",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
