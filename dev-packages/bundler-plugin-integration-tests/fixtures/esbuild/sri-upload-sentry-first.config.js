import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/sri-upload.config.js";
import { sriHtmlPlugin } from "./sri-html-plugin.js";

await esbuild.build({
  entryPoints: ["./src/dynamic-import.js"],
  bundle: true,
  splitting: true,
  format: "esm",
  outdir: "./out/sri-upload-sentry-first",
  minify: true,
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(sentryConfig), sriHtmlPlugin()],
});
