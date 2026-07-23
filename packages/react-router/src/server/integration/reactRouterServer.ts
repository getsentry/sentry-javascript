import { defineIntegration } from '@sentry/core';
import { registerServerBuildGlobal } from '../serverBuild';

const INTEGRATION_NAME = 'ReactRouterServer' as const;

/**
 * Integration capturing tracing data for React Router server functions.
 */
export const reactRouterServerIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // Register global for Vite plugin ServerBuild capture (used for middleware name resolution).
      registerServerBuildGlobal();
    },
  };
});
