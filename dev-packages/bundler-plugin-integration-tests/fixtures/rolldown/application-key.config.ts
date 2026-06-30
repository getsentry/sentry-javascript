import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/application-key.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/application-key/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
