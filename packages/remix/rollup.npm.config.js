import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // Todo: Replace with -> ['src/index.server.ts', 'src/index.client.tsx'],
    entrypoints: 'src/index.ts',
  }),
);
