import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/module-metadata.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/module-metadata/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
