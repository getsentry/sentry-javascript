import { NoopTransport } from '@sentry/core';

import { NodeClientOptions } from '../../src/types';

export function getDefaultNodeClientOptions(options: Partial<NodeClientOptions> = {}): NodeClientOptions {
  return {
    integrations: [],
    transport: NoopTransport,
    stackParser: () => [],
    ...options,
  };
}
