/* eslint-disable import/export */
import type { Client, EventProcessor, Integration } from '@sentry/core';
import { addEventProcessor, applySdkMetadata } from '@sentry/core';
import type { BrowserOptions } from '@sentry/react';
import { getDefaultIntegrations as getReactDefaultIntegrations, init as reactInit } from '@sentry/react';
import { browserTracingIntegration } from './browserTracingIntegration';

export type { BrowserOptions };
export { browserTracingIntegration } from './browserTracingIntegration';

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

/** Inits the Sentry vinext SDK on the browser. */
export function init(options: BrowserOptions): Client | undefined {
  const opts = {
    environment: options.environment || process.env.NODE_ENV,
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  } satisfies BrowserOptions;

  applySdkMetadata(opts, 'vinext', ['vinext', 'react']);

  const client = reactInit(opts);

  const filter404Transactions: EventProcessor = event =>
    event.type === 'transaction' && event.transaction === '/404' ? null : event;
  filter404Transactions.id = 'VinextClient404Filter';
  addEventProcessor(filter404Transactions);

  const filterRedirectErrors: EventProcessor = (_event, hint) => {
    const originalException = hint?.originalException;
    if (
      typeof originalException === 'object' &&
      originalException !== null &&
      'digest' in originalException &&
      typeof (originalException as { digest: unknown }).digest === 'string' &&
      (originalException as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      return null;
    }
    return _event;
  };
  filterRedirectErrors.id = 'VinextRedirectErrorFilter';
  addEventProcessor(filterRedirectErrors);

  return client;
}

function getDefaultIntegrations(options: BrowserOptions): Integration[] {
  const customDefaultIntegrations = getReactDefaultIntegrations(options);

  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    customDefaultIntegrations.push(browserTracingIntegration());
  }

  return customDefaultIntegrations;
}

export * from '../common';

export * from '@sentry/react';
