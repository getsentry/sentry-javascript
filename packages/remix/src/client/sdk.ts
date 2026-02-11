import type { Client } from '@sentry/core';
import { applySdkMetadata } from '@sentry/core';
import { init as reactInit } from '@sentry/react';
import type { RemixOptions } from '../utils/remixOptions';

/**
 * Initializes the Remix SDK.
 * @param options The configuration options.
 * @returns The initialized SDK.
 */
export function init(options: RemixOptions): Client | undefined {
  const opts = {
    ...options,
    environment: options.environment || process.env.NODE_ENV,
  };

  applySdkMetadata(opts, 'remix', ['remix', 'react']);

  return reactInit(opts);
}
