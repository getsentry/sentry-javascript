import { BrowserOptions, buildMetadata, init as browserInit } from '@sentry/browser';

const PACKAGE_NAME = 'angular';

/**
 * Inits the Angular SDK
 */
export function init(options: BrowserOptions): void {
  buildMetadata(options, PACKAGE_NAME, [PACKAGE_NAME]);
  browserInit(options);
}
