import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

const baseConfig = makeBaseNPMConfig({
  entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/server/index.ts', 'src/client/index.ts'],
  packageSpecificConfig: {
    output: {
      preserveModulesRoot: 'src',
    },
  },
});

// Extend external to handle effect/* and @sentry/* subpath imports
const originalExternal = baseConfig.external || [];
baseConfig.external = id => {
  // Match effect and all effect/* subpaths
  if (id === 'effect' || id.startsWith('effect/')) {
    return true;
  }
  // Match @sentry/* packages (they should be external dependencies, not bundled)
  if (id.startsWith('@sentry/')) {
    return true;
  }
  // Fall back to original external array check
  if (Array.isArray(originalExternal)) {
    return originalExternal.includes(id);
  }
  return false;
};

export default makeNPMConfigVariants(baseConfig);
