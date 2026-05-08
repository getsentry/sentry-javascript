import type { Breadcrumb } from '@sentry/core';
import { NODE_VERSION } from '@sentry/node-core';
import { expect } from 'vitest';

export function getNodeDeprecationBreadcrumbs(): Breadcrumb[] {
  const message = `(node:4075) [DEP0205] DeprecationWarning: \`module.register()\` is deprecated. Use \`module.registerHooks()\` instead.
  (Use \`node --trace-deprecation ...\` to show where the warning was created)`;

  if (NODE_VERSION.major < 26) {
    return [];
  }

  return [
    {
      category: 'console',
      data: {
        arguments: [message],
        logger: 'console',
      },
      level: 'error',
      message: message,
      timestamp: expect.any(Number),
    },
  ];
}
