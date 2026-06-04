import { sentryWebpackPlugin } from "@sentry/webpack-plugin";
import { sentryConfig } from "../configs/after-upload-deletion.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve("./out/after-upload-deletion"),
    filename: "basic.js",
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
