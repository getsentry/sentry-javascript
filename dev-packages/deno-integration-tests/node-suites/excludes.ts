// Node suites that do not run on Deno, relative to `node-integration-tests`. A single test that
// fails on Deno runs only on the other runtimes, with `test.runIf(supports({ runtimes }))` in the
// Node suite, and is not listed here.

// Node-only features: ANR and native thread watchdogs, child process and worker thread breadcrumbs, and the AWS Lambda Node runtime.
const NODE_ONLY = [
  'suites/anr/test.ts',
  'suites/aws-lambda-web/**',
  'suites/breadcrumbs/**',
  'suites/thread-blocked-native/test.ts',
];

// In the ESM tests Deno cannot find `PrismaClient`, a CommonJS export of `@prisma/client`.
const PRISMA_ESM_INTEROP = ['suites/tracing/prisma-orm-v5/test.ts', 'suites/tracing/prisma-orm-v6/test.ts'];

// In the CJS tests Deno cannot `require()` a dependency that ships only ES modules: `graphql` 17,
// `escape-string-regexp` under `mastra`, and `@prisma/orm-postgres`. The ESM tests of `mastra` also
// check `fetch` spans. The ESM test of `prisma-orm-v8` imports JSON with `with { type: 'json' }`,
// which any module load hook breaks on Deno 2.8.3 (the CI version); it passes on Deno 2.9.0.
const REQUIRE_OF_ESM_ONLY_DEPENDENCY = [
  'suites/tracing/graphql-tracing-channel/**',
  'suites/tracing/mastra/**',
  'suites/tracing/prisma-orm-v8/test.ts',
];

// Some or all tests fail on Deno. The cause is not investigated yet. In most AI suites the span
// streaming test fails. `apollo-graphql` (CJS tests only) and `mongodb` fail on Deno 2.8.3 (the CI
// version) and pass on Deno 2.9.0.
const NOT_TRIAGED = [
  'suites/tracing/anthropic/test.ts',
  'suites/tracing/anthropic/v0.129/test.ts',
  'suites/tracing/apollo-graphql/**',
  'suites/tracing/fastify/test.ts',
  'suites/tracing/flue/test.ts',
  'suites/tracing/google-genai/test.ts',
  'suites/tracing/groq/test.ts',
  'suites/tracing/http-client-spans/http-strip-query/test.ts',
  'suites/tracing/ioredis-dc/test.ts',
  'suites/tracing/koa/test.ts',
  'suites/tracing/langchain/test.ts',
  'suites/tracing/langgraph/test.ts',
  'suites/tracing/mistral-v2/test.ts',
  'suites/tracing/mistral/test.ts',
  'suites/tracing/mongodb/test.ts',
  'suites/tracing/mongoose-v5/test.ts',
  'suites/tracing/mysql/test.ts',
  'suites/tracing/openai/v5/**',
  'suites/tracing/openai/v7/test.ts',
  'suites/tracing/orchestrion-lazy-registration/test.ts',
  'suites/tracing/prisma-orm-v7/test.ts',
  'suites/tracing/together-ai/test.ts',
  'suites/tracing/vercelai/v6_v7/**',
];

// Passes on Deno when run alone, but failed in about 1 of 3 full runs of this package.
const FLAKY = ['suites/tracing/tracePropagationTargets/**'];

// The scenarios import `@sentry/deno` in place of `@sentry/node`, see `import-map.json` and
// `alias-sentry-deno.ts`. The suites below fail only because of that.

// The scenario uses an `@sentry/node` export that `@sentry/deno` does not have, such as
// `httpIntegration`, `nativeNodeFetchIntegration`, `cron` or the Node logging and queue
// integrations.
const NO_SENTRY_DENO_EXPORT = [
  'suites/cron/cron/test.ts',
  'suites/cron/node-cron/base/test.ts',
  'suites/cron/node-cron/isolateTrace/test.ts',
  'suites/cron/node-schedule/test.ts',
  'suites/esm/modules-integration/test.ts',
  'suites/express/multiple-init/test.ts',
  'suites/express/tracing/request-data/test.ts',
  'suites/express/tracing/routing/test.ts',
  'suites/express/with-http/maxIncomingRequestBodySize/test.ts',
  'suites/fs-instrumentation/test.ts',
  'suites/node-runtime-metrics/test.ts',
  'suites/pino/test.ts',
  'suites/sessions/crashed-session-aggregate/test.ts',
  'suites/sessions/errored-session-aggregate/test.ts',
  'suites/sessions/exited-session-aggregate/test.ts',
  'suites/sessions/server-without-process-session/test.ts',
  'suites/tracing/bullmq/test.ts',
  'suites/tracing/http-client-spans/fetch-forward-request-hook/test.ts',
  'suites/tracing/http-client-spans/fetch-headers-to-span-attributes/test.ts',
  'suites/tracing/httpIntegration/test.ts',
  'suites/tracing/requests/fetch-no-trace-propagation/test.ts',
  'suites/tracing/requests/fetch-no-tracing-no-spans/test.ts',
  'suites/tracing/requests/http-no-trace-propagation/test.ts',
  'suites/tracing/requests/http-no-tracing-no-spans/test.ts',
  'suites/vercel/keep-alive/test.ts',
  'suites/winston/test.ts',
];

// The scenario drives the OpenTelemetry tracer of the client (`client.tracer`), which only
// `NodeClient` has.
const NO_CLIENT_TRACER = ['suites/tracing/tracer-start-active-span-error/test.ts'];

// The `logger` of `@sentry/node` also takes a `printf`-style message with an array of parameters
// (`logger.info('test info with %d', [1])`). `@sentry/deno` has the `logger` of `@sentry/core`,
// which does not.
const NO_NODE_LOGGER_PARAMETERS = ['suites/public-api/logs/test.ts'];

// The test expects data that a default integration of `@sentry/node` adds and `@sentry/deno` does
// not have: process sessions, child process breadcrumbs, the `modules` of the event, the
// `node_system_error` context, and the context attributes of `nodeContextIntegration` on spans.
const NO_NODE_DEFAULT_INTEGRATION = [
  'suites/child-process/test.ts',
  'suites/context/test.ts',
  'suites/modules/test.ts',
  'suites/public-api/startSpan/basic-usage/with-children/test.ts',
  'suites/sessions/process-session/test.ts',
  'suites/system-error/test.ts',
];

// `@sentry/deno` captures uncaught exceptions and unhandled rejections with
// `globalHandlersIntegration`, so the mechanism is `auto.deno.global_handlers.*`, and a rejection
// with a string is not turned into an `Error`.
const GLOBAL_HANDLERS_DIFFER = [
  'suites/public-api/OnUncaughtException/test.ts',
  'suites/public-api/onUnhandledRejectionIntegration/test.ts',
];

// `@sentry/deno` does not send client reports: unlike `NodeClient`, `DenoClient` never flushes the
// outcomes it records.
const NO_CLIENT_REPORTS = [
  'suites/client-reports/**',
  'suites/integrations/dedupe/test.ts',
  'suites/tracing/ignoreSpans/attributes/test.ts',
  'suites/tracing/ignoreSpans/children/test.ts',
  'suites/tracing/ignoreSpans/continued-trace-child/test.ts',
  'suites/tracing/ignoreSpans/continued-trace-http-client/test.ts',
  'suites/tracing/ignoreSpans/segments/test.ts',
  'suites/tracing/no-parent-span-client-report/test.ts',
  'suites/tracing/redis-dc/test.ts',
  'suites/tracing/sampling-static/test.ts',
  'suites/tracing/sampling/test.ts',
];

// The request IP address is `::ffff:127.0.0.1`, not `::1`. The cause is not investigated yet.
const REQUEST_IP_DIFFERS = ['suites/express/requestUser/test.ts'];

export const NODE_SUITES_EXCLUDE = [
  '**/node_modules/**',
  ...NODE_ONLY,
  ...PRISMA_ESM_INTEROP,
  ...REQUIRE_OF_ESM_ONLY_DEPENDENCY,
  ...NOT_TRIAGED,
  ...FLAKY,
  ...NO_SENTRY_DENO_EXPORT,
  ...NO_CLIENT_TRACER,
  ...NO_NODE_LOGGER_PARAMETERS,
  ...NO_NODE_DEFAULT_INTEGRATION,
  ...GLOBAL_HANDLERS_DIFFER,
  ...NO_CLIENT_REPORTS,
  ...REQUEST_IP_DIFFERS,
];
