import {
  dedupeIntegration,
  functionToStringIntegration,
  inboundFiltersIntegration,
  linkedErrorsIntegration,
  requestDataIntegration,
} from '@sentry/core';
import type { Integration, Options } from '@sentry/types';

import { fetchIntegration } from './integrations/fetch';

/** Get the default integrations for the Cloudflare SDK. */
export function getDefaultIntegrations(options: Options): Integration[] {
  const integrations = [
    dedupeIntegration(),
    inboundFiltersIntegration(),
    functionToStringIntegration(),
    linkedErrorsIntegration(),
    fetchIntegration(),
  ];

  if (options.sendDefaultPii) {
    integrations.push(requestDataIntegration());
  }

  return integrations;
}
