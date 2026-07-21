import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { sentryConfig } from "../configs/release-value-with-quotes.config.js";

export default defineConfig({
  build: {
    minify: false,
    outDir: "./out/release-value-with-quotes",
    rollupOptions: {
      input: "./src/release-value-with-quotes.js",
      output: {
        entryFileNames: "bundle.js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
