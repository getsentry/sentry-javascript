import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/sourcemaps-ignore.config.js";

export default defineConfig({
  input: ["src/entry1.js", "src/entry2.js"],
  output: {
    dir: "out/sourcemaps-ignore",
    chunkFileNames: "[name].js",
    sourcemap: true,
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
