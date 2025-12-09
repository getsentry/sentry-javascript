// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */
export type {
  ComponentTrackingInitOptions as ComponentTrackingOptions,
  TrackComponentOptions as TrackingOptions,
} from './types';

export * from '@sentry/browser';

export { init } from './sdk';

export { trackComponent } from './performance';

export { withSentryConfig } from './config';
