import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/after-upload-deletion.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/after-upload-deletion/basic.js",
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
