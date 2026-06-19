import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { sentryConfig } from "../configs/vite-mpa-extra-modules.config.js";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    outDir: "./out/vite-mpa-extra-modules",
    rollupOptions: {
      input: {
        index: resolve("./src/vite-mpa-index.html"),
        page1: resolve("./src/vite-mpa-page1.html"),
        page2: resolve("./src/vite-mpa-page2.html"),
      },
      output: {
        chunkFileNames: "[name].js",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
