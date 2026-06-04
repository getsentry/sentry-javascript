import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/debugid-disabled.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/debugid-disabled/basic.js",
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
