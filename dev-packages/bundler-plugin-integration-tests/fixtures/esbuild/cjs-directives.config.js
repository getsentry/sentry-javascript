import * as esbuild from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/bundler-plugins/esbuild";

await esbuild.build({
  entryPoints: {
    sloppy: "./src/sloppy-mode.cjs",
  },
  bundle: true,
  outdir: "./out/cjs-directives/without-plugin",
  outExtension: { ".js": ".cjs" },
  minify: false,
  format: "cjs",
  tsconfigRaw: { compilerOptions: { alwaysStrict: false } },
});

await esbuild.build({
  entryPoints: {
    strict: "./src/strict-mode.cjs",
    sloppy: "./src/sloppy-mode.cjs",
  },
  bundle: true,
  outdir: "./out/cjs-directives/static-injection",
  outExtension: { ".js": ".cjs" },
  minify: false,
  format: "cjs",
  tsconfigRaw: { compilerOptions: { alwaysStrict: false } },
  plugins: [
    sentryEsbuildPlugin({
      telemetry: false,
      release: { name: "strict-mode-release", create: false },
      sourcemaps: { disable: true },
    }),
  ],
});

await esbuild.build({
  entryPoints: {
    strict: "./src/strict-mode.cjs",
    sloppy: "./src/sloppy-mode.cjs",
  },
  bundle: true,
  outdir: "./out/cjs-directives/debug-id-injection",
  outExtension: { ".js": ".cjs" },
  minify: false,
  format: "cjs",
  sourcemap: true,
  tsconfigRaw: { compilerOptions: { alwaysStrict: false } },
  plugins: [
    sentryEsbuildPlugin({
      telemetry: false,
      release: { inject: false },
      sourcemaps: { disable: "disable-upload" },
    }),
  ],
});
