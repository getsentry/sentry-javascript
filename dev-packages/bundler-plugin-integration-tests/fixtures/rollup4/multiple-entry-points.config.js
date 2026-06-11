import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/multiple-entry-points.config.js";

export default defineConfig({
  input: ["src/entry1.js", "src/entry2.js"],
  output: {
    dir: "out/multiple-entry-points",
    chunkFileNames: "[name].js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
