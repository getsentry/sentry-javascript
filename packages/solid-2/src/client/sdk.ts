import type { BrowserOptions } from '@sentry/browser';
import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { solidErrorsIntegration } from './errors';

/** Initializes the browser half of the Solid 2 SDK. */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'solid-2', ['solid-2', 'browser']);

  return browserInit(opts);
}

/**
 * The browser SDK's defaults plus Solid's error hook: a rendered `<Errored>`
 * fallback reports in every build tier without wrapping anything. Tracing
 * (`solidTracingIntegration`) is opt-in, like `browserTracingIntegration`,
 * and needs the `observe` build.
 */
export function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  return [...getBrowserDefaultIntegrations(options), solidErrorsIntegration()];
}
