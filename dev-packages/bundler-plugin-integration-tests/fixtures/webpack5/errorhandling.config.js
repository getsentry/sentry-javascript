import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { getErrorHandlingConfig } from "../configs/errorhandling.config.js";
import { resolve } from "node:path";

const FAKE_SENTRY_PORT = process.env.FAKE_SENTRY_PORT || "9876";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve("./out/errorhandling"),
    filename: "basic.js",
    libraryTarget: "commonjs2",
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(getErrorHandlingConfig(FAKE_SENTRY_PORT))],
};
