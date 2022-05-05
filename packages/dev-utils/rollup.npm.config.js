import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // This way we don't have to worry about whether third-party packages have updated to ESM yet.
    esModuleInterop: true,
  }),
);
