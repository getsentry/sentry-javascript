import { sentryRollupPlugin } from "@sentry/rollup-plugin";
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
