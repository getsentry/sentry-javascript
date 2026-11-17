import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/multiple-outputs-mixed-sourcemaps.config.js";

export default defineConfig({
  input: ["src/entry1.js", "src/entry2.js"],
  output: [
    {
      dir: "out/multiple-outputs-mixed-sourcemaps",
      format: "es",
      entryFileNames: "[name].mjs",
      chunkFileNames: "[name].mjs",
      sourcemap: true,
    },
    {
      dir: "out/multiple-outputs-mixed-sourcemaps",
      format: "cjs",
      entryFileNames: "[name].cjs",
      chunkFileNames: "[name].cjs",
    },
  ],
  plugins: [sentryRollupPlugin(sentryConfig)],
});
