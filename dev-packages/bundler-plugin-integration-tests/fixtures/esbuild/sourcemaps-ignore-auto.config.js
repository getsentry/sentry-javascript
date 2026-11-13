import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/sourcemaps-ignore-auto.config.js";

await esbuild.build({
  entryPoints: ["./src/entry1.js", "./src/entry2.js"],
  bundle: true,
  outdir: "./out/sourcemaps-ignore-auto",
  minify: false,
  format: "esm",
  splitting: true,
  chunkNames: "[name]",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
