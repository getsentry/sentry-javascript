import { makeBaseNPMConfig, makeNPMConfigVariants } from '../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // We build the polyfills separately because they're not included in the top-level exports of the package, in order
    // to keep them out of the public API.
    entrypoints: ['src/index.ts', 'src/buildPolyfills/index.ts'],
  }),
);
