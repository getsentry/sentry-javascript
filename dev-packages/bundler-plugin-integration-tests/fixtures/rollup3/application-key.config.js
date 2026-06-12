import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/application-key.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/application-key/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
