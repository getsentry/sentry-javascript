import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { sentryConfig } from "../configs/release-value-with-quotes.config.js";

await esbuild.build({
  entryPoints: ["./src/release-value-with-quotes.js"],
  bundle: true,
  outfile: "./out/release-value-with-quotes/bundle.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
