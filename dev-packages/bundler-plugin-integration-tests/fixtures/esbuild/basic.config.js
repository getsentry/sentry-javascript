import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/basic.config.js";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/basic/basic.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
