import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/bundle-size-optimizations.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/bundle.js",
      output: {
        dir: "out/bundle-size-optimizations",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
