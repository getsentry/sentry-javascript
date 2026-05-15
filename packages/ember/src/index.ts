/**
 * @sentry/ember - Official Sentry SDK for Ember.js
 *
 * @see {@link https://docs.sentry.io/platforms/javascript/guides/ember/ Sentry Ember Documentation}
 */

// Re-export everything from @sentry/browser
export * from '@sentry/browser';

export { init } from './utils/sentry/init.ts';
export { instrumentRoutePerformance } from './utils/sentry/instrument-route-performance.ts';
export {
  _resetGlobalInstrumentation,
  browserTracingIntegration,
  setupPerformance,
} from './utils/sentry/setup-performance.ts';
export type { EmberBrowserTracingOptions } from './utils/sentry/setup-performance.ts';
