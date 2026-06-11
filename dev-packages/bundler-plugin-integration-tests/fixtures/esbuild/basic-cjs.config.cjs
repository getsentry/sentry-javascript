const esbuild = require("esbuild");
const { sentryEsbuildPlugin } = require("@sentry/bundler-plugins/esbuild");
const { sentryConfig } = require("../configs/basic.config.cjs");

esbuild.build({
  entryPoints: ["./src/basic.js"],
  bundle: true,
  outfile: "./out/basic-cjs/basic.js",
  minify: false,
  format: "iife",
  plugins: [sentryEsbuildPlugin(sentryConfig)],
});
