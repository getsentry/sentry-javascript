import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/utils';

import type { NodeExperimentalClientOptions } from '../../src/types';

export function getDefaultNodeExperimentalClientOptions(
  options: Partial<NodeExperimentalClientOptions> = {},
): NodeExperimentalClientOptions {
  return {
    tracesSampleRate: 1,
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
