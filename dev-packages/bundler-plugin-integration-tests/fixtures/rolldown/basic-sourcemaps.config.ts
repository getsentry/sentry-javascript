import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/basic-sourcemaps.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/basic-sourcemaps/basic.js",
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
