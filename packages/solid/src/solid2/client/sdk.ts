import type { BrowserOptions } from '@sentry/browser';
import { getDefaultIntegrations as getBrowserDefaultIntegrations, init as browserInit } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { solidErrorsIntegration } from './errors';

/**
 * Initializes the Solid SDK for Solid 2.
 */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(opts, 'solid');

  return browserInit(opts);
}

export function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  return [...getBrowserDefaultIntegrations(options), solidErrorsIntegration()];
}
