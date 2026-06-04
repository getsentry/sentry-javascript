import { sentryWebpackPlugin } from "@sentry/webpack-plugin";
import { sentryConfig } from "../configs/basic-release-disabled.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve("./out/basic-release-disabled"),
    filename: "basic.js",
  },
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
