import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts', 'src/request.ts', 'src/vite/index.ts'],
  }),
  { splitDevProd: true },
);
