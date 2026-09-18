import * as Sentry from '@sentry/node';

// No DSN: nothing is sent. `init()` installs the runtime diagnostics-channel
// hook regardless, and that is the code path under test.
Sentry.init({ tracesSampleRate: 0 });

// The marker is printed for diagnosis only. The test asserts on whether the SDK
// warned, not on how it decided to, so it does not pin one implementation.
// eslint-disable-next-line no-console
console.log(`APP_STARTED bundler_marker=${globalThis.__SENTRY_ORCHESTRION__?.bundler instanceof Set}`);
