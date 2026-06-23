import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/multiple-entry-points.config.js";

await esbuild.build({
  entryPoints: ["./src/entry1.js", "./src/entry2.js"],
  bundle: true,
  outdir: "./out/multiple-entry-points",
  minify: false,
  format: "esm",
  splitting: true,
  chunkNames: "[name]",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
