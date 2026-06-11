import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { defineConfig } from "vite";
import { sentryConfig } from "../configs/component-annotation-disabled.config.js";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/app.jsx",
      // We exclude these to keep the snapshot small
      external: [/node_modules/],
      makeAbsoluteExternalsRelative: true,
      output: {
        dir: "out/component-annotation-disabled",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [react({ jsxRuntime: "automatic" }), sentryVitePlugin(sentryConfig)],
});
