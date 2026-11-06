// The handler and managed variants send the server events to the event proxy too, so the tests also see server
// spans.
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'handler' ||
  process.env.NEXT_PUBLIC_E2E_TEST_TUNNEL_MODE === 'managed'
    ? 'http://public@localhost:3031/1337'
    : // A fake but properly formatted Sentry SaaS DSN, because the rewrite mode tunnels only SaaS DSNs
      'https://public@o12345.ingest.us.sentry.io/67890';
