import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/sourcemaps-assets-auto.config.js";

export default defineConfig({
  input: ["src/entry1.js", "src/entry2.js"],
  output: {
    dir: "out/sourcemaps-assets-auto",
    chunkFileNames: "[name].js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
