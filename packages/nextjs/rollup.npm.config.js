import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // We need to include `instrumentServer.ts` separately because it's only conditionally required, and so rollup
    // doesn't automatically include it when calculating the module dependency tree.
    entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/utils/instrumentServer.ts'],
    // prevent this nextjs code from ending up in our built package (this doesn't happen automatially because the name
    // doesn't match an SDK dependency)
    externals: ['next/router'],
    watchPackages: ['integrations', 'node', 'react', 'tracing'],
  }),
);
