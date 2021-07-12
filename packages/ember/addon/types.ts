import { BrowserOptions } from '@sentry/browser';

export type EmberSentryConfig = {
  sentry: BrowserOptions & { browserTracingOptions: Object };
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
  browserTracingOptions: Object;
};

export type OwnConfig = {
  sentryConfig: EmberSentryConfig;
};

export type GlobalConfig = {
  __sentryEmberConfig: EmberSentryConfig['sentry'];
};
