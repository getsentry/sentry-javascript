import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rolldown";
import { getErrorHandlingConfig } from "../configs/errorhandling.config.js";

const FAKE_SENTRY_PORT = process.env["FAKE_SENTRY_PORT"] || "9876";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/errorhandling/basic.js",
    format: "cjs",
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(getErrorHandlingConfig(FAKE_SENTRY_PORT))],
});
