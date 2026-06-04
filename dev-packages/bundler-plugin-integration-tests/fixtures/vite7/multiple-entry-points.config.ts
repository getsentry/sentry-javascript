import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/multiple-entry-points.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: ["src/entry1.js", "src/entry2.js"],
      output: {
        dir: "out/multiple-entry-points",
        chunkFileNames: "[name].js",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
