import type { Integration } from '@sentry/core';
import {
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
  stackParserFromStackParserOptions,
} from '@sentry/core';
import type { CloudflareClientOptions, CloudflareOptions } from './client';
import { CloudflareClient } from './client';
import { fetchIntegration } from './integrations/fetch';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  const sendDefaultPii = options.sendDefaultPii ?? false;
  return [
    dedupeIntegration(),
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    requestDataIntegration(sendDefaultPii ? undefined : { include: { cookies: false } }),
  ];
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
  };

  return initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
}
