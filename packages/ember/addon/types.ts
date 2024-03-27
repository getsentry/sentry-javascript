import type { BrowserOptions, browserTracingIntegration } from '@sentry/browser';

type BrowserTracingOptions = Parameters<typeof browserTracingIntegration>[0];

export type EmberSentryConfig = {
  sentry: BrowserOptions & { browserTracingOptions?: BrowserTracingOptions };
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
  browserTracingOptions: BrowserTracingOptions;
};

export type OwnConfig = {
  sentryConfig: EmberSentryConfig;
};

// This is private in Ember and not really exported, so we "mock" these types here.
export interface EmberRouterMain {
  location: {
    getURL?: () => string;
    formatURL?: (url: string) => string;
    implementation: string;
    rootURL: string;
  };
}

export type GlobalConfig = {
  __sentryEmberConfig: EmberSentryConfig['sentry'];
};
