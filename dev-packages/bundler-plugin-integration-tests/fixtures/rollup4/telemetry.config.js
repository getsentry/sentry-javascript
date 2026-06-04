import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/telemetry.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/telemetry/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
