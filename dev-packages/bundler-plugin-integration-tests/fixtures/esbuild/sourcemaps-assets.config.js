import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";
import { sentryConfig } from "../configs/sourcemaps-assets.config.js";

await esbuild.build({
  entryPoints: ["./src/entry1.js", "./src/entry2.js"],
  bundle: true,
  outdir: "./out/sourcemaps-assets",
  minify: false,
  format: "esm",
  splitting: true,
  chunkNames: "[name]",
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
