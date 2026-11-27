import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import html from "@rollup/plugin-html";
import { defineConfig } from "rolldown";
import sri from "rollup-plugin-sri";
import { sentryConfig } from "../configs/sri-disable-upload.config.js";

export default defineConfig({
  input: "src/dynamic-import.js",
  output: {
    dir: "out/sri-disable-upload-sentry-last",
    format: "es",
    sourcemap: true,
  },
  plugins: [html(), sri(), sentryRollupPlugin(sentryConfig)],
});
