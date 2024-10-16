import * as Sentry from '@sentry/nextjs';

export const config = {
  runtime: 'edge',
};

export default async function handler() {
  // Without a working async context strategy the two spans created by `Sentry.startSpan()` would be nested.

  const outerSpanPromise = Sentry.startSpan({ name: 'outer-span' }, () => {
    return new Promise<void>(resolve => setTimeout(resolve, 300));
  });

  const innerSpanPromise = new Promise<void>(resolve => {
    setTimeout(() => {
      Sentry.startSpan({ name: 'inner-span' }, () => {
        return new Promise<void>(resolve => setTimeout(resolve, 100));
      }).then(() => {
        resolve();
      });
    }, 100);
  });

  await outerSpanPromise;
  await innerSpanPromise;

  return new Response('ok', { status: 200 });
}
