import { onUncaughtExceptionIntegration as originalOnUncaughtExceptionIntegration } from '@sentry/node-experimental';

export const onUncaughtExceptionIntegration: typeof originalOnUncaughtExceptionIntegration = options => {
  return originalOnUncaughtExceptionIntegration({ ...options, exitEvenIfOtherHandlersAreRegistered: false });
};
