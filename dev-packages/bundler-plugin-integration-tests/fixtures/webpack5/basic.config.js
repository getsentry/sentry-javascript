import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { sentryConfig } from "../configs/basic.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve("./out/basic"),
    filename: "basic.js",
  },
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
