import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/basic-sourcemaps.config.js";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/basic-sourcemaps/basic-sourcemaps.js",
  minify: false,
  format: "iife",
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
