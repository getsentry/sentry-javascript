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
      output: {
        // Multiple entry points with no single default export -> emit named exports
        // so rollup doesn't warn. `preserveModules` (true by default in the base config)
        // keeps the per-submodule file layout the `exports` map points at.
        exports: 'named',
        // The source default-imports CJS Node builtins (e.g. `import crypto from 'crypto'`).
        // The shared base config's `interop: 'esModule'` would emit `require('crypto').default`
        // in the CJS build (undefined for real CJS modules -> runtime crash). `auto` emits the
        // interop helper so default-imported CJS builtins resolve correctly.
        interop: 'auto',
      },
    },
  }),
);
