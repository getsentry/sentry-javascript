declare module 'ember-get-config' {
  import { BrowserOptions } from '@sentry/browser';
  type EmberSentryConfig = {
    sentry: BrowserOptions;
    transitionTimeout: number;
    ignoreEmberOnErrorWarning: boolean;
    disablePerformance: boolean;
    disablePostTransitionRender: boolean;
  };
  const config: {
    '@sentry/ember': EmberSentryConfig;
  };
  export default config;
}
