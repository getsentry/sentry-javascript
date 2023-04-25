import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

const baseVariants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts'],
    packageSpecificConfig: {
      output: {
        // Combine output into a single file to avoid expensive require/import calls
        preserveModules: false,
      },
    },
  }),
);

const polyfillVariants = makeNPMConfigVariants(
  makeBaseNPMConfig({
    // We build the polyfills separately because they're not included in the top-level exports of the package, in order
    // to keep them out of the public API.
    entrypoints: ['src/buildPolyfills/index.ts'],
    packageSpecificConfig: {
      output: {
        entryFileNames: () => 'buildPolyfills.js',
        // Combine output into a single file to avoid expensive require/import calls
        preserveModules: false,
      },
    },
  }),
);

export default baseVariants.concat(polyfillVariants);
