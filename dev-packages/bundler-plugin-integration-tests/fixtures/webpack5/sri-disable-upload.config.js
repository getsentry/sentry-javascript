import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import { SubresourceIntegrityPlugin } from "webpack-subresource-integrity";
import { sentryConfig } from "../configs/sri-disable-upload.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/dynamic-import.js",
  output: {
    path: resolve("./out/sri-disable-upload"),
    filename: "[name].js",
    chunkFilename: "[name].js",
    crossOriginLoading: "anonymous",
  },
  devtool: "source-map",
  mode: "production",
  plugins: [
    new HtmlWebpackPlugin(),
    new SubresourceIntegrityPlugin({ hashFuncNames: ["sha384"] }),
    sentryWebpackPlugin(sentryConfig),
  ],
};
