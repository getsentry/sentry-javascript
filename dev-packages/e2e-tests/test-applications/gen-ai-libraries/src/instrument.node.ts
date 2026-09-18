import * as Sentry from '@sentry/node';

// Loaded through `node --import`, so the runtime channel-injection hook transforms the AI SDKs and
// express as they load. (The Cloudflare variant covers the build-time bundler-plugin injection path.)
Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
  enableRuntimeChannelInjection: true,
});
