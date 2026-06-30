import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/application-key.config.js";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/application-key/application-key.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
