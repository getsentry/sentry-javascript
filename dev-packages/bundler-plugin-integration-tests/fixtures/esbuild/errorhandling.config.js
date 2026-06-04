import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { getErrorHandlingConfig } from "../configs/errorhandling.config.js";

const FAKE_SENTRY_PORT = process.env.FAKE_SENTRY_PORT || "9876";

await esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/errorhandling/basic.js",
  minify: false,
  format: "cjs",
  sourcemap: true,
  plugins: [sentryEsbuildPlugin(getErrorHandlingConfig(FAKE_SENTRY_PORT))],
});
