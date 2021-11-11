import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  tracesSampleRate: 1,
  debug: process.env.SDK_DEBUG,

  integrations: defaults => [
    ...defaults.filter(
      integration =>
        // filter out `Console` since the tests are happening in the console and we don't need to record what's printed
        // there, because we can see it (this makes debug logging much less noisy, since intercepted events which are
        // printed to the console no longer create console breadcrumbs, which then get printed, creating even longer
        // console breadcrumbs, which get printed, etc, etc)

        // filter out `Http` so its options can be changed below (otherwise, default one wins because it's initialized first)
        integration.name !== 'Console' && integration.name !== 'Http',
    ),

    // Used for testing http tracing
    new Sentry.Integrations.Http({ tracing: true }),
  ],
});
