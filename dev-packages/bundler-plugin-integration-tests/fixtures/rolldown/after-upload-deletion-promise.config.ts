import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { getSentryConfig } from "../configs/after-upload-deletion-promise.config.js";

const outDir = "out/after-upload-deletion-promise";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: `${outDir}/basic.js`,
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(getSentryConfig(outDir))],
});
