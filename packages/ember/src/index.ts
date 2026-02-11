/**
 * @sentry/ember - Official Sentry SDK for Ember.js
 *
 * @see {@link https://docs.sentry.io/platforms/javascript/guides/ember/ Sentry Ember Documentation}
 */

// Re-export everything from @sentry/browser
export * from '@sentry/browser';

// Sentry-specific utilities
export {
  INITIAL_LOAD_BODY_SCRIPT,
  INITIAL_LOAD_BODY_SCRIPT_HASH,
  INITIAL_LOAD_HEAD_SCRIPT,
  INITIAL_LOAD_HEAD_SCRIPT_HASH,
} from './utils/sentry/constants.ts';
export { init } from './utils/sentry/init.ts';
export { instrumentRoutePerformance } from './utils/sentry/instrument-route-performance.ts';
export {
  _resetGlobalInstrumentation,
  setupPerformance,
} from './utils/sentry/setup-performance.ts';
