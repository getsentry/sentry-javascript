import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { getSentryConfig } from "../configs/after-upload-deletion-promise.config.js";

const outDir = "./out/after-upload-deletion-promise";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: `${outDir}/basic.js`,
  minify: false,
  format: "iife",
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(getSentryConfig(outDir))],
});
