import { BrowserOptions, init as browserInit } from '@sentry/browser';

/**
 * Inits the React SDK
 */
export function init(options: BrowserOptions): void {
  options.metadata = options.metadata || {};
  options.metadata.name = options.metadata.name || 'sentry.javascript.react';
  browserInit(options);
}
