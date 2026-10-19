import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.ts',
      'src/setup.ts',
      'src/bundler-plugin/vite.ts',
      'src/bundler-plugin/rollup.ts',
      'src/bundler-plugin/webpack.ts',
      'src/bundler-plugin/esbuild.ts',
    ],
  }),
);
