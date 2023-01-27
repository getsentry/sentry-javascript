import { captureException } from '@sentry/core';

/**
 * Wraps an `app` directory server component with Sentry error instrumentation.
 */
export function wrapAppDirComponentWithSentry(wrappingTarget: any): any {
  return async function WrappedPage(this: unknown, ...args: any[]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      return await wrappingTarget.apply(this, args);
    } catch (e) {
      captureException(e);
      throw e;
    }
  };
}
