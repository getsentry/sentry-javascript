import { addTracingExtensions, applySdkMetadata } from '@sentry/core';
import type { VercelEdgeOptions } from '@sentry/vercel-edge';
import { getDefaultIntegrations, init as vercelEdgeInit } from '@sentry/vercel-edge';

import { isBuild } from '../common/utils/isBuild';
import { rewriteFramesIntegration } from './rewriteFramesIntegration';

export type EdgeOptions = VercelEdgeOptions;

export { rewriteFramesIntegration };

/** Inits the Sentry NextJS SDK on the Edge Runtime. */
export function init(options: VercelEdgeOptions = {}): void {
  addTracingExtensions();

  if (isBuild()) {
    return;
  }

  const customDefaultIntegrations = [...getDefaultIntegrations(options), rewriteFramesIntegration()];

  const opts = {
    defaultIntegrations: customDefaultIntegrations,
    ...options,
  };

  applySdkMetadata(opts, 'nextjs');

  vercelEdgeInit(opts);
}

/**
 * Just a passthrough in case this is imported from the client.
 */
export function withSentryConfig<T>(exportedUserNextConfig: T): T {
  return exportedUserNextConfig;
}

export * from '@sentry/vercel-edge';
export { Span, Transaction } from '@sentry/core';

export * from '../common';

export {
  // eslint-disable-next-line deprecation/deprecation
  withSentryAPI,
  wrapApiHandlerWithSentry,
} from './wrapApiHandlerWithSentry';
