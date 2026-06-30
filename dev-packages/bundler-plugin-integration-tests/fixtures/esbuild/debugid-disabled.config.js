import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/debugid-disabled.config.js";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/debugid-disabled/debugid-disabled.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
