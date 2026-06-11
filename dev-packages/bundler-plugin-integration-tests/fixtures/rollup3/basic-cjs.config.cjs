const { sentryRollupPlugin } = require("@sentry/bundler-plugins/rollup");
const { defineConfig } = require("rollup");
const { sentryConfig } = require("../configs/basic.config.cjs");

module.exports = defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/basic-cjs/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
