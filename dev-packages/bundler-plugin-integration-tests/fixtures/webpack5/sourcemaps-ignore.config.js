import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { sentryConfig } from "../configs/sourcemaps-ignore.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: {
    entry1: "./src/entry1.js",
    entry2: "./src/entry2.js",
  },
  output: {
    path: resolve("./out/sourcemaps-ignore"),
    filename: "[name].js",
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
