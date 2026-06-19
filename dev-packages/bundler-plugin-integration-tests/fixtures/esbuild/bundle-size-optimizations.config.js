import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { sentryConfig } from "../configs/bundle-size-optimizations.config.js";

await esbuild.build({
  entryPoints: ["./src/bundle.js"],
  bundle: true,
  outfile: "./out/bundle-size-optimizations/bundle-size-optimizations.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
