import { httpIntegration as originalHttpIntegration } from '@sentry/node-experimental';

export const httpIntegration: typeof originalHttpIntegration = options => {
  return originalHttpIntegration({ ...options, tracing: true });
};
