import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/bundle-size-optimizations.config.js";

export default defineConfig({
  input: "src/bundle.js",
  output: {
    file: "out/bundle-size-optimizations/bundle.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
