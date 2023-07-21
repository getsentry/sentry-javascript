import { createTransport } from '@sentry/core';
import { resolvedSyncPromise } from '@sentry/utils';

import type { NodePreviewClientOptions } from '../../src/types';

export function getDefaultNodePreviewClientOptions(
  options: Partial<NodePreviewClientOptions> = {},
): NodePreviewClientOptions {
  return {
    integrations: [],
    transport: () => createTransport({ recordDroppedEvent: () => undefined }, _ => resolvedSyncPromise({})),
    stackParser: () => [],
    ...options,
  };
}
