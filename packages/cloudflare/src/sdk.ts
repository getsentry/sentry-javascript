import type { Integration } from '@sentry/core';
import {
  consoleIntegration,
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
import { makeFlushLock } from './flush';
import { fetchIntegration } from './integrations/fetch';
import { makeCloudflareTransport } from './transport';
import { defaultStackParser } from './vendor/stacktrace';

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: CloudflareOptions): Integration[] {
  const sendDefaultPii = options.sendDefaultPii ?? false;
  return [
    dedupeIntegration(),
    // TODO(v10): Replace with `eventFiltersIntegration` once we remove the deprecated `inboundFiltersIntegration`
    // eslint-disable-next-line deprecation/deprecation
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
    // TODO(v10): the `include` object should be defined directly in the integration based on `sendDefaultPii`
    requestDataIntegration(sendDefaultPii ? undefined : { include: { cookies: false } }),
    consoleIntegration(),
  ];
}

/**
 * Initializes the cloudflare SDK.
 */
export function init(options: CloudflareOptions): CloudflareClient | undefined {
  if (options.defaultIntegrations === undefined) {
    options.defaultIntegrations = getDefaultIntegrations(options);
  }

  const flushLock = options.ctx ? makeFlushLock(options.ctx) : undefined;
  delete options.ctx;

  const clientOptions: CloudflareClientOptions = {
    ...options,
    stackParser: stackParserFromStackParserOptions(options.stackParser || defaultStackParser),
    integrations: getIntegrationsToSetup(options),
    transport: options.transport || makeCloudflareTransport,
    flushLock,
  };

  return initAndBind(CloudflareClient, clientOptions) as CloudflareClient;
}
