import { captureException } from '@sentry/core';

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
export function wrapAppDirComponentWithSentry(wrappingTarget: any): any {
  // Super interesting: even though users may define server components as async functions, Next.js will turn them into
  // synchronous functions and it will transform any`await`s into instances of the`use` hook. 🤯
  return function sentryWrappedServerComponent(this: unknown, ...args: any[]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return wrappingTarget.apply(this, args);
    } catch (e) {
      captureException(e);
      throw e;
    }
  };
}
