import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { getSentryConfig } from "../configs/after-upload-deletion-promise.config.js";
import { resolve } from "node:path";

const outDir = "./out/after-upload-deletion-promise";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve(outDir),
    filename: "basic.js",
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(getSentryConfig(outDir))],
};
