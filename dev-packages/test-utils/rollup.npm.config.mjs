import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts', 'src/cli.ts', 'src/cloudflare.ts', 'src/tunnel-suite.ts'],
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        preserveModules: false,
      },
    },
  }),
);
