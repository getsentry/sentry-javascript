import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/build-info.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/build-info/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
