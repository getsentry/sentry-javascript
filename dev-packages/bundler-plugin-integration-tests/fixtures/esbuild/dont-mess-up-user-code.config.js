import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { sentryConfig } from "../configs/dont-mess-up-user-code.config.js";

await esbuild.build({
  entryPoints: ["./src/index.js"],
  bundle: true,
  outfile: "./out/dont-mess-up-user-code/index.js",
  minify: false,
  format: "iife",
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
