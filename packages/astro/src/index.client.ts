/* eslint-disable import/export */
export * from '@sentry/browser';

// Override the browserTracingIntegration with the custom Astro version
export { browserTracingIntegration } from './client/browserTracingIntegration';

export { init } from './client/sdk';
