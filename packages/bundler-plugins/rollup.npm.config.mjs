import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/core/index.ts',
      'src/rollup/index.ts',
      'src/vite/index.ts',
      'src/esbuild/index.ts',
      'src/webpack/index.ts',
      'src/webpack/webpack5.ts',
      'src/webpack/component-annotation-transform.ts',
      'src/babel-plugin/index.ts',
    ],
    packageSpecificConfig: {
      // This package only ever runs in Node, at build time. Without pinning the platform, rolldown
      // would infer 'browser' for the ESM half, which defines `process.env.NODE_ENV` as
      // 'development' (silently disabling release creation and sourcemap upload) and drops the
      // `import.meta.url` rewrite the `createRequire` calls in `./webpack` depend on.
      platform: 'node',
      output: {
        // Multiple entry points with no single default export -> emit named exports
        // so the bundler doesn't warn. `preserveModules` (true by default in the base config)
        // keeps the per-submodule file layout the `exports` map points at.
        exports: 'named',
      },
    },
  }),
);
