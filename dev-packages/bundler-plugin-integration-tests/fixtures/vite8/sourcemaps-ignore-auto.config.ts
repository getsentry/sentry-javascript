import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/sourcemaps-ignore-auto.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: ["src/entry1.js", "src/entry2.js"],
      output: {
        dir: "out/sourcemaps-ignore-auto",
        chunkFileNames: "[name].js",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
