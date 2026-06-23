import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { sentryConfig } from "../configs/basic-sourcemaps.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve("./out/basic-sourcemaps"),
    filename: "basic.js",
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
