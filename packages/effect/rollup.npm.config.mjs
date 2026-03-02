import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  packageSpecificConfig: {
    output: {
      preserveModulesRoot: 'src',
    },
  },
});

// Extend external to handle effect/* subpath imports
const originalExternal = baseConfig.external || [];
baseConfig.external = id => {
  // Match effect and all effect/* subpaths
  if (id === 'effect' || id.startsWith('effect/')) {
    return true;
  }
  // Fall back to original external array check
  if (Array.isArray(originalExternal)) {
    return originalExternal.includes(id);
  }
  return false;
};

export default makeNPMConfigVariants(baseConfig);
