/** @type {import('eslint').ESLint.Options} */
module.exports = {
  root: true,
  extends: ["@sentry-internal/eslint-config/base"],
  ignorePatterns: [
    ".eslintrc.js",
    "fixtures/*/out",
    "fixtures/*/src",
    // We ignore Vite and Rollup fixtures for now because there are a couple of version mismatches.
    "fixtures/vite*/**/*",
    "fixtures/rollup*/**/*",
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  env: {
    node: true,
  },
  rules: {
    "@typescript-eslint/explicit-function-return-type": "off",
  },
};
