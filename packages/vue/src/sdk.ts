import type { BrowserOptions } from '@sentry/browser';
import { BrowserClient, defaultStackParser, getDefaultIntegrations, makeFetchTransport } from '@sentry/browser';
import type { Client, Integration } from '@sentry/core';
import { applySdkMetadata, getClientOptions, initAndBind } from '@sentry/core';
import { vueIntegration } from './integration';
import type { Options } from './types';

/**
 * Inits the Vue SDK
 */
export function init(options: Partial<Omit<Options, 'tracingOptions'>> = {}): Client | undefined {
  const clientOptions = getClientOptions(options, {
    integrations: getVueDefaultIntegrations(options),
    stackParser: defaultStackParser,
    transport: makeFetchTransport,
  });

  applySdkMetadata(clientOptions, 'vue');

  return initAndBind(BrowserClient, clientOptions);
}

function getVueDefaultIntegrations(options: BrowserOptions): Integration[] {
  return [...getDefaultIntegrations(options), vueIntegration()];
}
