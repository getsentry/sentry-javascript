import { defineIntegration } from '@sentry/core';
import { onUncaughtExceptionIntegration as originalOnUncaughtExceptionIntegration } from '@sentry/node-experimental';
import type { IntegrationFn } from '@sentry/types';

export const customOnUncaughtException = ((options?: Parameters<typeof originalOnUncaughtExceptionIntegration>[0]) => {
  return originalOnUncaughtExceptionIntegration({
    exitEvenIfOtherHandlersAreRegistered: false,
    ...options,
  });
}) satisfies IntegrationFn;

export const onUncaughtExceptionIntegration = defineIntegration(customOnUncaughtException);
