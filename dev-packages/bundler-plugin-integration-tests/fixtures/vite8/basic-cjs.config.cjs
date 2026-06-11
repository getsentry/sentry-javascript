const { sentryVitePlugin } = require("@sentry/bundler-plugins/vite");
const { defineConfig } = require("vite");
const { sentryConfig } = require("../configs/basic.config.js");

module.exports = defineConfig({
  build: {
    minify: false,
    rollupOptions: {
      input: "src/basic.js",
      output: {
        dir: "out/basic-cjs",
        entryFileNames: "[name].js",
      },
    },
  },
  plugins: [sentryVitePlugin(sentryConfig)],
});
