import { applySdkMetadata } from '@sentry/core';
import { init as reactInit } from '@sentry/react';

import type { Client } from '@sentry/core';
import type { GatsbyOptions } from './utils/types';

/**
 * Inits the Sentry Gatsby SDK.
 */
export function init(options: GatsbyOptions): Client | undefined {
  applySdkMetadata(options, 'gatsby');
  return reactInit({
    ...options,
  });
}
