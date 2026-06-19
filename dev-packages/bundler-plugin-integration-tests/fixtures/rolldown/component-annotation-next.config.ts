import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rolldown";
import { sentryConfig } from "../configs/component-annotation-next.config.js";

export default defineConfig({
  input: "src/app.jsx",
  // We exclude these to keep the snapshot small
  external: [/node_modules/],
  makeAbsoluteExternalsRelative: true,
  output: {
    file: "out/component-annotation-next/app.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
