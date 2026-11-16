import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.ts',
      'src/index.bun.ts',
      'src/index.cloudflare.ts',
      'src/index.deno.ts',
      'src/setup.ts',
      'src/bundler-plugin/webpack.ts',
    ],
  }),
);
