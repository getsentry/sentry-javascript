import hashbang from 'rollup-plugin-hashbang';

import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.server.ts', 'src/index.client.tsx', 'scripts/upload-sourcemaps.ts'],
    packageSpecificConfig: {
      // Rollup fails when there's a hashbang in the file
      // Ref: https://github.com/rollup/rollup/issues/235
      // This plugin also gives execution permissions to the output files.
      plugins: [hashbang()],
    },
  }),
);
