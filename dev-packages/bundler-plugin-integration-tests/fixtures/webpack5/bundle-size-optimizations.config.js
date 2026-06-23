import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { sentryConfig } from "../configs/bundle-size-optimizations.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/bundle.js",
  output: {
    path: resolve("./out/bundle-size-optimizations"),
    filename: "bundle.js",
  },
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
