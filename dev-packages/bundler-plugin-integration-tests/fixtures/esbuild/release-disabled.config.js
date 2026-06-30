import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/release-disabled.config.js";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/release-disabled/release-disabled.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
