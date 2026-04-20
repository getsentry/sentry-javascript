import { consoleSandbox, defineIntegration } from '@sentry/core';

/**
 * This is a shim for the SpanStreaming integration.
 * It is needed in order for the CDN bundles to continue working when users add/remove span streaming
 * from it, without changing their config. This is necessary for the loader mechanism.
 */
export const spanStreamingIntegrationShim = defineIntegration(() => {
  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn('You are using spanStreamingIntegration() even though this bundle does not include span streaming.');
  });

  return {
    name: 'SpanStreaming',
  };
});
