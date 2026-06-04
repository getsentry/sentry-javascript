import { sentryWebpackPlugin } from "@sentry/webpack-plugin";
import { sentryConfig } from "../configs/release-value-with-quotes.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/release-value-with-quotes.js",
  output: {
    path: resolve("./out/release-value-with-quotes"),
    filename: "bundle.js",
  },
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
