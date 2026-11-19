import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.ts',
      'src/solidrouter.ts',
      'src/tanstackrouter.ts',
      'src/solid2/index.ts',
      'src/solid2/solidrouter.ts',
    ],
  }),
);
