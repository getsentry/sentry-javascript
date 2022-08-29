export type {
  ComponentTrackingInitOptions as ComponentTrackingOptions,
  TrackComponentOptions as TrackingOptions,
} from './types';

export * from '@sentry/browser';

export { init } from './sdk';

export { componentTrackingPreprocessor } from './preprocessors';
export { trackComponent } from './performance';
