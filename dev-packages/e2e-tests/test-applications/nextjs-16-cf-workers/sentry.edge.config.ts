import * as Sentry from '@sentry/nextjs';

// Only hands over the build release: `withSentry` from `@sentry/nextjs/cloudflare` in worker.ts creates the client and
// holds the options.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_E2E_TEST_DSN,
});
