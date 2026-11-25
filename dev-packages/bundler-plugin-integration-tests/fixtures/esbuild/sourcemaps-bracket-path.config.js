import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/basic-sourcemaps.config.js";

await esbuild.build({
  entryPoints: { "widget[id]": "./src/basic.js" },
  bundle: true,
  outdir: "./out/sourcemaps-bracket-path",
  minify: false,
  format: "iife",
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
