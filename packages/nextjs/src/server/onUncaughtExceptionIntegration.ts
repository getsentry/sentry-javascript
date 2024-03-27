import { onUncaughtExceptionIntegration as originalOnUncaughtExceptionIntegration } from '@sentry/node';

export const onUncaughtExceptionIntegration: typeof originalOnUncaughtExceptionIntegration = options => {
  return originalOnUncaughtExceptionIntegration({ ...options, exitEvenIfOtherHandlersAreRegistered: false });
};
