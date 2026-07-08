import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/telemetry.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/telemetry/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
