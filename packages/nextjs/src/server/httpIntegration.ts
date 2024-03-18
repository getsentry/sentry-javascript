import { defineIntegration } from '@sentry/core';
import { httpIntegration as originalHttpIntegration } from '@sentry/node-experimental';
import type { IntegrationFn } from '@sentry/types';

export const customHttpIntegration = ((options?: Parameters<typeof originalHttpIntegration>[0]) => {
  return originalHttpIntegration({
    ...options,
    tracing: true,
  });
}) satisfies IntegrationFn;

export const httpIntegration = defineIntegration(customHttpIntegration);
