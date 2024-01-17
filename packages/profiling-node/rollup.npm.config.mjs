import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const configs = makeNPMConfigVariants(makeBaseNPMConfig());
const cjsConfig = configs.find(config => config.format === 'cjs');

if (!cjsConfig) {
  throw new Error('CJS config is required for profiling-node.');
}

export default {
  ...cjsConfig,
};
