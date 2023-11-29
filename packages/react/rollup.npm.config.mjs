import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.mjs';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    esModuleInterop: true,
  }),
);
