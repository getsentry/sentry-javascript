import {
  type BrowserOptions,
  browserTracingIntegration,
  getDefaultIntegrations as getBrowserDefaultIntegrations,
  init as initBrowser,
} from '@sentry/browser';
import { applySdkMetadata, hasTracingEnabled } from '@sentry/core';
import type { Client, Integration } from '@sentry/types';
import type { SentryNuxtOptions } from '../common/types';

/**
 * Initializes the client-side of the Nuxt SDK
 *
 * @param options Configuration options for the SDK.
 */
export function init(options: SentryNuxtOptions): Client | undefined {
  const sentryOptions = {
    defaultIntegrations: getDefaultIntegrations(options),
    ...options,
  };

  applySdkMetadata(sentryOptions, 'nuxt', ['nuxt', 'vue']);

  return initBrowser(sentryOptions);
}

// Tree-shakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

function getDefaultIntegrations(options: BrowserOptions): Integration[] | undefined {
  // This evaluates to true unless __SENTRY_TRACING__ is text-replaced with "false",
  // in which case everything inside will get tree-shaken away
  if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
    if (hasTracingEnabled(options)) {
      return [...getBrowserDefaultIntegrations(options), browserTracingIntegration()];
    }
  }

  return undefined;
}
