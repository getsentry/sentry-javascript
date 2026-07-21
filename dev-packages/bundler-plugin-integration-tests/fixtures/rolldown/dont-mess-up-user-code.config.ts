import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/dont-mess-up-user-code.config.js";

export default defineConfig({
  input: "src/index.js",
  output: {
    file: "out/dont-mess-up-user-code/index.js",
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
