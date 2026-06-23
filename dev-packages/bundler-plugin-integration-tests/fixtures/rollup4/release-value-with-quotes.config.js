import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/release-value-with-quotes.config.js";

export default defineConfig({
  input: "src/release-value-with-quotes.js",
  output: {
    file: "out/release-value-with-quotes/bundle.js",
    format: "iife",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
