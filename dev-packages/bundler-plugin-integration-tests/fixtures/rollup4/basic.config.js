import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/basic.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/basic/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
