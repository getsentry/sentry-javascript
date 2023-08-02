import * as Sentry from '@sentry/nextjs';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  // Without `runWithAsyncContext` and a working async context strategy the two spans created by `Sentry.trace()` would be nested.

  const outerSpanPromise = Sentry.runWithAsyncContext(() => {
    return Sentry.trace({ name: 'outer-span' }, () => {
      return new Promise<void>(resolve => setTimeout(resolve, 300));
    });
  });

  setTimeout(() => {
    Sentry.runWithAsyncContext(() => {
      return Sentry.trace({ name: 'inner-span' }, () => {
        return new Promise<void>(resolve => setTimeout(resolve, 100));
      });
    });
  }, 100);

  await outerSpanPromise;

  return new Response('ok', { status: 200 });
}
