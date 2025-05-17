import type { BrowserOptions } from '@sentry/browser';
import { getDefaultIntegrations, initWithDefaultIntegrations } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { vueIntegration } from './integration';
import type { Options } from './types';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const opts = {
    ...options,
  };

  applySdkMetadata(opts, 'vue');

  return initWithDefaultIntegrations(opts, getVueDefaultIntegrations);
}

function getVueDefaultIntegrations(options: BrowserOptions): Integration[] {
  return [...getDefaultIntegrations(options), vueIntegration()];
}
