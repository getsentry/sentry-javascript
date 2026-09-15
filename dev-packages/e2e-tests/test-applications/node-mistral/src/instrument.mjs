// Shared Sentry bootstrap for both modes.
//
// dev  - loaded through `node --import`, so the runtime channel-injection hook transforms
//        `@mistralai/mistralai`, `dataloader` and `express` as they load.
// prod - bundled into `dist/app.cjs` by `build.mjs`, where `sentryEsbuildPlugin` applies the same
//        transforms at build time. Runtime injection is switched off there so the bundler plugin is
//        the only possible injector and a passing prod test really proves the build-time path.
import * as Sentry from '@sentry/node';

// `production` is the bundled build, where `sentryEsbuildPlugin` already injected the channels.
const isDev = process.env.TEST_ENV === 'development';

Sentry.init({
  environment: 'qa',
  dsn: process.env.E2E_TEST_DSN,
  debug: !!process.env.DEBUG,
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
  traceLifecycle: 'stream',
  enableRuntimeChannelInjection: isDev,
  integrations: [Sentry.spanStreamingIntegration()],
});

Sentry.setTag('e2e.mode', isDev ? 'development' : 'production');
