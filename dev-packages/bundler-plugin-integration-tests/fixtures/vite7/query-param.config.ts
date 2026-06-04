import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/query-param.config.js";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: ["src/entry1.js", "src/entry2.js"],
      output: {
        dir: "out/query-param",
        chunkFileNames: "[name].js?seP58q4g",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
