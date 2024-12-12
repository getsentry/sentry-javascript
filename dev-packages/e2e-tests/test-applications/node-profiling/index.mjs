// This tests asserts that @sentr/profiling-node is not patching globalThis values, which
// breaks our runtime detection and can break instrumentation
// https://github.com/getsentry/sentry-javascript/issues/14525#issuecomment-2511208064
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

console.log('🧵 Starting ESM test');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function assertUnpatchedRequire() {
  if (typeof require !== 'undefined') {
    // Test that globalThis.require is not defined by any side effects of the profiling
    // https://github.com/getsentry/sentry-javascript/issues/13662
    throw new Error(
      `globalThis.require should not be defined, check that profiling integration is not defining it, received: ` +
        typeof require,
    );
  }
}

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

Sentry.startSpan({ name: 'Precompile test' }, async () => {
  await wait(500);
});

assertUnpatchedRequire();
console.log('✅ Require is not patched');
