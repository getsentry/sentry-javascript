import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node';
import { ReactRouterInstrumentation } from '../instrumentation/reactRouter';

const INTEGRATION_NAME = 'React Router Server';

const instrumentReactRouter = generateInstrumentOnce('React-Router-Server', () => {
  return new ReactRouterInstrumentation();
});

export const instrumentReactRouterServer = Object.assign(
  (): void => {
    instrumentReactRouter();
  },
  { id: INTEGRATION_NAME },
);

/**
 * Integration capturing tracing data for React Router server functions.
 */
export const reactRouterServerIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentReactRouterServer();
    },
  };
});
