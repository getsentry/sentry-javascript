import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/debugids-already-injected.config.js";

export default defineConfig({
  build: {
    minify: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/debugids-already-injected",
        entryFileNames: "[name].js",
        sourcemapDebugIds: true,
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
