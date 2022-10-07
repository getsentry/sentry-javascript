import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.server.ts', 'src/index.client.tsx'],
    packageSpecificConfig: {
      external: ['react-router', 'react-router-dom'],
      output: {
        // make it so Rollup calms down about the fact that we're combining default and named exports
        exports: 'named',
      },
    },
  }),
);
