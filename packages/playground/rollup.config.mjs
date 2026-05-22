// @ts-check
import { sentryRollupPlugin } from "@sentry/rollup-plugin";

const input = ["src/entrypoint1.js"];

export default {
  input,
  plugins: [
    sentryRollupPlugin({
      debug: true,
    }),
  ],
  output: {
    dir: "./out/rollup",
    format: "cjs",
    exports: "named",
    sourcemap: true,
  },
};
