import type * as Sentry from '@sentry/sveltekit';

// If the SDK's declarations fail to resolve a SvelteKit type, `skipLibCheck` hides the error and
// the type accepts anything. That unresolved type isn't caught by the usual `0 extends 1 & T` any
// check, so test for a top type instead. Checked by `check:sentry-types` in `test:build`.
type AcceptsAnything<T> = unknown extends T ? true : false;
type ExpectFalse<T extends false> = T;

export type SentryTypeChecks = [
  ExpectFalse<AcceptsAnything<ReturnType<typeof Sentry.sentryHandle>>>,
  ExpectFalse<AcceptsAnything<ReturnType<typeof Sentry.initCloudflareSentryHandle>>>,
];
