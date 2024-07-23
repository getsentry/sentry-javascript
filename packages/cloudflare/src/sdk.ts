import {
  dedupeIntegration,
  functionToStringIntegration,
  getIntegrationsToSetup,
  inboundFiltersIntegration,
  initAndBind,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';
import type { Integration, Options } from '@sentry/types';
import { stackParserFromStackParserOptions } from '@sentry/utils';
import type { CloudflareClientOptions } from './client';
import { CloudflareClient } from './client';

import { fetchIntegration } from './integrations/fetch';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(_options: Options): Integration[] {
  return [
    dedupeIntegration(),
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    requestDataIntegration(),
  ];
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: Options): CloudflareClient | undefined {
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
