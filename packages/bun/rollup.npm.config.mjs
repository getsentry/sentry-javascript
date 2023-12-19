import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const config = makeNPMConfigVariants(makeBaseNPMConfig());

// remove cjs from config array config[0].output.format == cjs
export default [config[1]];
