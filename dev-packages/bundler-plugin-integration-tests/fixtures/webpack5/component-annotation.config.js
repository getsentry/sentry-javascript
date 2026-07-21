import { sentryWebpackPlugin } from "@sentry/bundler-plugins/webpack";
import { sentryConfig } from "../configs/component-annotation.config.js";
import { resolve } from "node:path";

export default {
  cache: false,
  entry: "./src/app.jsx",
  output: {
    path: resolve("./out/component-annotation"),
    filename: "app.js",
  },
  optimization: {
    minimize: false,
  },
  mode: "production",
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [["@babel/preset-react", { runtime: "automatic" }]],
          },
        },
      },
    ],
  },
  resolve: {
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },
  externals: {
    react: "react",
    "react/jsx-runtime": "react/jsx-runtime",
  },
  plugins: [sentryWebpackPlugin(sentryConfig)],
};
