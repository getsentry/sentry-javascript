/**
 * @sentry/ember - Official Sentry SDK for Ember.js
 *
 * @see {@link https://docs.sentry.io/platforms/javascript/guides/ember/ Sentry Ember Documentation}
 */

// Re-export everything from @sentry/browser
export * from '@sentry/browser';

// Sentry-specific utilities
export { init } from './init.ts';
export { instrumentRoutePerformance } from './utils/instrumentRoutePerformance.ts';
export { browserTracingIntegration } from './utils/browserTracingIntegration.ts';
