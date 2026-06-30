import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/release-disabled.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/release-disabled/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
