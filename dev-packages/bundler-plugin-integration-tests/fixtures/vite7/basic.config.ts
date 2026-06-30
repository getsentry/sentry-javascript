import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/basic.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/basic",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
