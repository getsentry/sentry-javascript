const { sentryRollupPlugin } = require("@sentry/bundler-plugins/rollup");
const { defineConfig } = require("rolldown");
const { sentryConfig } = require("../configs/basic.config.js");

module.exports = defineConfig({
  input: "src/basic.js",
  output: {
    file: "out/basic-cjs/basic.js",
  },
  plugins: [sentryRollupPlugin(sentryConfig)],
});
