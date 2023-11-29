import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.mjs';

const config = makeNPMConfigVariants(makeBaseNPMConfig());

// remove cjs from config array config[0].output.format == cjs
export default [config[1]];
