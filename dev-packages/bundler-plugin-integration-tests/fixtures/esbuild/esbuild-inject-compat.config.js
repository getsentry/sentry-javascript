import * as esbuild from "esbuild";
import * as path from "path";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";

await esbuild.build({
  entryPoints: ["./src/inject-compat-index.ts"],
  bundle: true,
  outfile: "./out/esbuild-inject-compat/index.js",
  inject: [path.resolve("./src/inject.ts")],
  minify: false,
  format: "iife",
  plugins: [
    sentryEsbuildPlugin({
      telemetry: false,
    }),
  ],
});
