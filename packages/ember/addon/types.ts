import { BrowserOptions } from '@sentry/browser';

export type EmberSentryConfig = {
  sentry: BrowserOptions;
  transitionTimeout: number;
  ignoreEmberOnErrorWarning: boolean;
  disableInstrumentComponents: boolean;
  disablePerformance: boolean;
  disablePostTransitionRender: boolean;
  disableRunloopPerformance: boolean;
  disableInitialLoadInstrumentation: boolean;
  enableComponentDefinitions: boolean;
  minimumRunloopQueueDuration: number;
  minimumComponentRenderDuration: number;
};

export type OwnConfig = {
  sentryConfig: EmberSentryConfig;
};
