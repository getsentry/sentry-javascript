export * from '@sentry/browser';

export { init } from './sdk';
// eslint-disable-next-line deprecation/deprecation
export { vueRouterInstrumentation } from './router';
export { browserTracingIntegration } from './browserTracingIntegration';
export { attachErrorHandler } from './errorhandler';
export { createTracingMixins } from './tracing';
export {
  vueIntegration,
  // eslint-disable-next-line deprecation/deprecation
  VueIntegration,
} from './integration';
