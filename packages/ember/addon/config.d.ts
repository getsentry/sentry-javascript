declare module 'ember-get-config' {
  import { BrowserOptions } from '@sentry/browser';
  type EmberSentryConfig = {
    sentry: BrowserOptions;
    disablePerformance: boolean;
    transitionTimeout: number;
    ignoreEmberOnErrorWarning: boolean;
  };
  const config: {
    '@sentry/ember': EmberSentryConfig;
  };
  export default config;
}
