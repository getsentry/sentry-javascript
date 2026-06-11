import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/bundle-size-optimizations.config.js";

export default defineConfig({
  input: "src/bundle.js",
  output: {
    file: "out/bundle-size-optimizations/bundle.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
