/** @type {import('eslint').ESLint.Options} */
module.exports = {
  root: true,
  extends: ["@sentry-internal/eslint-config/base"],
  ignorePatterns: [
    ".eslintrc.js",
    "fixtures/*/out",
    "fixtures/*/src",
    // We ignore Vite fixtures for now because there are a couple of version mismatches.
    "fixtures/vite*/**/*",
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
