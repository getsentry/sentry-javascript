import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";

await esbuild.build({
  entryPoints: ["./src/cjs-directives.js"],
  bundle: true,
  outfile: "./out/cjs-directives/static-injection.cjs",
  minify: false,
  format: "cjs",
  plugins: [
    sentryEsbuildPlugin({
      telemetry: false,
      release: { name: "strict-mode-release", create: false },
      sourcemaps: { disable: true },
    }),
  ],
});

await esbuild.build({
  entryPoints: ["./src/cjs-directives.js"],
  bundle: true,
  outfile: "./out/cjs-directives/debug-id-injection.cjs",
  minify: false,
  format: "cjs",
  sourcemap: true,
  plugins: [
    sentryEsbuildPlugin({
      telemetry: false,
      release: { inject: false },
      sourcemaps: { disable: "disable-upload" },
    }),
  ],
});
