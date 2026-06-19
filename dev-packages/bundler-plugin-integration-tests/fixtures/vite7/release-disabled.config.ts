import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/release-disabled.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/release-disabled",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
