import { sentryWebpackPlugin } from "@sentry/webpack-plugin";
import { sentryConfig } from "../configs/debugids-already-injected.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/basic.js",
  output: {
    path: resolve("./out/debugids-already-injected"),
    filename: "basic.js",
  },
  devtool: "source-map",
  optimization: {
    minimize: false,
  },
  mode: "production",
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
