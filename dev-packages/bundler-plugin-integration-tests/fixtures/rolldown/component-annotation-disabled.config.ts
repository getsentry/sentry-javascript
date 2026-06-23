import { sentryRollupPlugin } from "@sentry/bundler-plugins/rollup";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/component-annotation-disabled.config.js";

export default defineConfig({
  input: "src/app.jsx",
  // We exclude these to keep the snapshot small
  external: [/node_modules/],
  makeAbsoluteExternalsRelative: true,
  output: {
    file: "out/component-annotation-disabled/app.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
