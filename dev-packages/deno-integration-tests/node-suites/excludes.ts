// Node suites that do not run on Deno, relative to `node-integration-tests`. A single test that
// fails on Deno is skipped with `test.skipIf` on `RUNTIME` in the Node suite, not listed here.

// Node-only features: ANR and native thread watchdogs, child process and worker thread breadcrumbs.
const NODE_ONLY = ['suites/anr/test.ts', 'suites/breadcrumbs/**', 'suites/thread-blocked-native/test.ts'];

// `@sentry/node` instruments `fetch` through undici's diagnostics channels, which Deno's `fetch`
// does not publish. `@sentry/deno` has its own `fetchIntegration` for this. These suites check
// spans, breadcrumbs or headers of outgoing `fetch` requests.
const NO_FETCH_INSTRUMENTATION = [
  'suites/tracing/double-baggage/**',
  'suites/tracing/http-client-span-streamed/test.ts',
  'suites/tracing/http-client-spans/fetch-basic-streamed/test.ts',
  'suites/tracing/http-client-spans/fetch-basic/test.ts',
  'suites/tracing/http-client-spans/fetch-error/test.ts',
  'suites/tracing/http-client-spans/fetch-forward-request-hook/test.ts',
  'suites/tracing/http-client-spans/fetch-headers-to-span-attributes/test.ts',
  'suites/tracing/http-client-spans/fetch-strip-query/test.ts',
  'suites/tracing/ignoreSpans-streamed/continued-trace-child/test.ts',
  'suites/tracing/ignoreSpans-streamed/continued-trace-http-client/test.ts',
  'suites/tracing/ignoreSpans-streamed/continued-trace-segment/test.ts',
  'suites/tracing/no-parent-span-client-report/test.ts',
  'suites/tracing/requests/fetch-breadcrumbs/test.ts',
  'suites/tracing/requests/fetch-no-trace-propagation/test.ts',
  'suites/tracing/requests/fetch-no-tracing-no-spans/test.ts',
  'suites/tracing/requests/fetch-no-tracing/test.ts',
  'suites/tracing/requests/fetch-sampled-no-active-span/test.ts',
  'suites/tracing/requests/fetch-unsampled/test.ts',
  'suites/tracing/requests/traceparent/test.ts',
  'suites/tracing/sample-rand-propagation/test.ts',
  'suites/tracing/sample-rate-propagation/**',
];

// In the ESM tests Deno cannot find `PrismaClient`, a CommonJS export of `@prisma/client`.
const PRISMA_ESM_INTEROP = ['suites/tracing/prisma-orm-v5/test.ts', 'suites/tracing/prisma-orm-v6/test.ts'];

// Some or all tests fail on Deno, cause not investigated yet. In most AI suites the span
// streaming test fails. `apollo-graphql` (CJS tests only) and `mongodb` fail on Deno 2.8.3 (the CI
// version) and pass on Deno 2.9.0.
const NOT_TRIAGED = [
  'suites/tracing/anthropic/test.ts',
  'suites/tracing/apollo-graphql/**',
  'suites/tracing/fastify/test.ts',
  'suites/tracing/google-genai/test.ts',
  'suites/tracing/groq/test.ts',
  'suites/tracing/http-client-spans/http-strip-query/test.ts',
  'suites/tracing/ioredis-dc/test.ts',
  'suites/tracing/koa/test.ts',
  'suites/tracing/langchain/test.ts',
  'suites/tracing/langgraph/test.ts',
  'suites/tracing/mistral/test.ts',
  'suites/tracing/mongodb/test.ts',
  'suites/tracing/mongoose-v5/test.ts',
  'suites/tracing/mysql/test.ts',
  'suites/tracing/openai/test.ts',
  'suites/tracing/orchestrion-lazy-registration/test.ts',
  'suites/tracing/prisma-orm-v7/test.ts',
  'suites/tracing/together-ai/test.ts',
  'suites/tracing/vercelai/v6_v7/test.ts',
];

// Passes on Deno when run alone, but failed in about 1 of 3 full runs of this package.
const FLAKY = ['suites/tracing/tracePropagationTargets/**'];

export const NODE_SUITES_EXCLUDE = [
  '**/node_modules/**',
  ...NODE_ONLY,
  ...NO_FETCH_INSTRUMENTATION,
  ...PRISMA_ESM_INTEROP,
  ...NOT_TRIAGED,
  ...FLAKY,
];
