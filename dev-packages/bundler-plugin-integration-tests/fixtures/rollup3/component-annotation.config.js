import { sentryRollupPlugin } from "@sentry/rollup-plugin";
import { defineConfig } from "rollup";
import { sentryConfig } from "../configs/component-annotation.config.js";
import { babel } from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";

const RESOLVABLE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx"];

export default defineConfig({
  input: "src/app.jsx",
  // We exclude these to keep the snapshot small
  external: [/node_modules/],
  makeAbsoluteExternalsRelative: true,
  output: {
    file: "out/component-annotation/app.js",
  },
  plugins: [
    resolve({
      extensions: RESOLVABLE_EXTENSIONS,
    }),
    sentryRollupPlugin(sentryConfig),
    babel({
      babelHelpers: "bundled",
      presets: [["@babel/preset-react", { runtime: "automatic" }]],
      extensions: RESOLVABLE_EXTENSIONS,
    }),
  ],
});
