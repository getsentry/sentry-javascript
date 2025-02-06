export type {
  ComponentTrackingInitOptions as ComponentTrackingOptions,
  TrackComponentOptions as TrackingOptions,
} from './types';

export * from '@sentry/browser';

export { init, initWithDefaultIntegrations } from './sdk';

export { trackComponent } from './performance';

export { withSentryConfig } from './config';
