export type {
  ComponentTrackingInitOptions as ComponentTrackingOptions,
  TrackComponentOptions as TrackingOptions,
} from './types';

export * from '@sentry/browser';

export { init } from './sdk';

// TODO(v8): Remove this export
export { componentTrackingPreprocessor } from './preprocessors';

export { trackComponent } from './performance';

export { withSentryConfig } from './config';
