import * as Sentry from '@sentry/node';

Sentry.init({ tracesSampleRate: 0 });

// `dataloader` is left external by the build, so it loads through Node's module
// loader and the runtime hook has to transform it. That is the only path on
// which a stripped code transformer actually costs the user instrumentation.
const { default: DataLoader } = await import('dataloader');
await new DataLoader(async keys => keys).load(1);

// eslint-disable-next-line no-console
console.log(`DEP_LOADED bundler_marker=${globalThis.__SENTRY_ORCHESTRION__?.bundler instanceof Set}`);
