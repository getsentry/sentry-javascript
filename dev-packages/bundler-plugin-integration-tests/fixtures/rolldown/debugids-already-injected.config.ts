import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/debugids-already-injected.config.js";

export default defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/debugids-already-injected/basic.js",
    sourcemap: true,
    sourcemapDebugIds: true,
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
