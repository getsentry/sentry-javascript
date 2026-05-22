/** @type {import('eslint').ESLint.Options} */
module.exports = {
  root: true,
  extends: ["@sentry-internal/eslint-config/base"],
  ignorePatterns: [
    ".eslintrc.js",
    "dist",
    "rollup.config.mjs",
    "test/fixtures/**/*",
    "sentry-release-injection-file.js",
    "sentry-esbuild-debugid-injection-file.js",
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json", "./test/tsconfig.json"],
  },
  env: {
    node: true,
  },
};
