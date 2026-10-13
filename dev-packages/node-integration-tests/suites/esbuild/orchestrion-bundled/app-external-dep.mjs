import * as Sentry from '@sentry/node';

Sentry.init({ tracesSampleRate: 0 });

// `dataloader` is left external by the build, so it loads through Node's module
// loader and the runtime hook has to transform it. That is the only path on
// which a stripped code transformer actually costs the user instrumentation.
const { default: DataLoader } = await import('dataloader');
await new DataLoader(async keys => keys).load(1);

// `runtime` lists the modules the runtime hook actually transformed. It stays empty when the
// transformer was stripped (dep loaded uninstrumented) and lists `dataloader` when the hook ran —
// so the tests can assert on the outcome, not just on whether a warning printed.
const runtime = JSON.stringify(globalThis.__SENTRY_ORCHESTRION__?.runtime ?? []);
// eslint-disable-next-line no-console
console.log(
  `DEP_LOADED bundler_marker=${globalThis.__SENTRY_ORCHESTRION__?.bundler instanceof Set} runtime=${runtime}`,
);
