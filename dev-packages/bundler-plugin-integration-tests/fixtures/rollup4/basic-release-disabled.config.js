import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/basic-release-disabled.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/basic-release-disabled/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
