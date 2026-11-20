// Node suites that do not run on Bun, relative to `node-integration-tests`. A single test that
// fails on Bun runs only on the other runtimes, with `test.runIf(supports({ runtimes }))` in the
// Node suite, and a suite or test that fails only on older Bun versions runs with
// `supports({ bunMin })`. Neither is listed here.

// Node-only features: ANR and native thread watchdogs, child processes, the AWS Lambda Node runtime,
// `node:sqlite`, which `flue` needs, and the Vercel keep-alive, which needs `http.server.response.finish`.
const NODE_ONLY = [
  'suites/anr/test.ts',
  'suites/aws-lambda-web/**',
  'suites/aws-serverless/**',
  'suites/breadcrumbs/**',
  'suites/child-process/test.ts',
  'suites/thread-blocked-native/test.ts',
  'suites/tracing/flue/test.ts',
  'suites/vercel/keep-alive/test.ts',
];

// Bun does not publish `http.server.request.start`, so `@sentry/node` creates no `http.server`
// span and does not isolate incoming requests. `@sentry/bun` has `bunHttpServerIntegration` for this,
// so the `@sentry/bun` project runs these suites, except the ones in `SENTRY_BUN_EXCLUDE`.
const NO_HTTP_SERVER_SPANS = [
  'suites/sessions/**',
  'suites/tracing/envelope-header/sampleRate-propagation/test.ts',
  'suites/tracing/httpIntegration-streamed/test.ts',
  'suites/tracing/httpIntegration/test.ts',
  'suites/tracing/httpServerSpans-unrouted/test.ts',
  'suites/tracing/ignoreSpans/**',
  'suites/tracing/managed-tunnel/test.ts',
  'suites/tunnel/hardening/test.ts',
  'suites/tracing/meta-tags-twp-errors/test.ts',
  'suites/tracing/meta-tags/test.ts',
  'suites/tracing/requestData/test.ts',
  'suites/tracing/sample-rand-propagation/test.ts',
  'suites/tracing/sample-rate-propagation/**',
  'suites/tracing/sampling-static/test.ts',
  'suites/tracing/sampling/test.ts',
  'suites/tracing/traceid-recycling-with-spans/test.ts',
  'suites/tracing/traceid-recycling/test.ts',
];

// `@sentry/node` instruments `fetch` through undici's diagnostics channels, which Bun's `fetch`
// does not publish. `@sentry/bun` has its own `fetchIntegration` for this, so the `@sentry/bun`
// project runs these suites, except the ones in `SENTRY_BUN_EXCLUDE`.
const NO_FETCH_INSTRUMENTATION = [
  'suites/tracing/double-baggage/**',
  'suites/tracing/http-client-span/test.ts',
  'suites/tracing/http-client-spans/fetch-basic-streamed/test.ts',
  'suites/tracing/http-client-spans/fetch-basic/test.ts',
  'suites/tracing/http-client-spans/fetch-error/test.ts',
  'suites/tracing/http-client-spans/fetch-forward-request-hook/test.ts',
  'suites/tracing/http-client-spans/fetch-headers-to-span-attributes/test.ts',
  'suites/tracing/http-client-spans/fetch-strip-query/test.ts',
  'suites/tracing/no-parent-span-client-report/test.ts',
  'suites/tracing/requests/fetch-breadcrumbs/test.ts',
  'suites/tracing/requests/fetch-no-trace-propagation/test.ts',
  'suites/tracing/requests/fetch-no-tracing-no-spans/test.ts',
  'suites/tracing/requests/fetch-no-tracing/test.ts',
  'suites/tracing/requests/fetch-sampled-no-active-span/test.ts',
  'suites/tracing/requests/fetch-sentry-requests/test.ts',
  'suites/tracing/requests/fetch-unsampled/test.ts',
  'suites/tracing/requests/traceparent/test.ts',
];

// Before Bun 1.4.6, `bun run` cannot inject the diagnostics channels into libraries, so framework,
// database and AI instrumentation creates no spans. Apps must be built with `@sentry/bun/plugin`.
// The `node-suites-bun-build` and `node-suites-bun-run` projects run these suites.
// See https://github.com/getsentry/sentry-javascript/issues/23882
export const NO_AUTO_INSTRUMENTATION = [
  'suites/cron/cron-integration/test.ts',
  'suites/cron/node-cron/integration/test.ts',
  'suites/cron/node-schedule-integration/test.ts',
  'suites/express/**',
  'suites/fs-instrumentation/test.ts',
  'suites/hono/test.ts',
  'suites/hono-sdk/test.ts',
  'suites/pino/test.ts',
  'suites/tracing/amqplib/test.ts',
  'suites/tracing/anthropic/test.ts',
  'suites/tracing/anthropic/v0/test.ts',
  'suites/tracing/anthropic/v0.129/test.ts',
  'suites/tracing/anthropic/v1/test.ts',
  'suites/tracing/apollo-graphql/**',
  'suites/tracing/dataloader/test.ts',
  'suites/tracing/fastify/test.ts',
  'suites/tracing/genericPool-v2/test.ts',
  'suites/tracing/genericPool/test.ts',
  'suites/tracing/is-localhost/test.ts',
  'suites/tracing/google-genai-v2/test.ts',
  'suites/tracing/google-genai-v3/test.ts',
  'suites/tracing/google-genai/test.ts',
  'suites/tracing/groq/test.ts',
  'suites/tracing/hapi/test.ts',
  'suites/tracing/ioredis-dc/test.ts',
  'suites/tracing/kafkajs/test.ts',
  'suites/tracing/knex/**',
  'suites/tracing/koa/test.ts',
  'suites/tracing/langchain/**',
  'suites/tracing/langgraph/**',
  'suites/tracing/lru-memoizer/test.ts',
  'suites/tracing/mastra/**',
  'suites/tracing/mcp-handler-exact-once/test.ts',
  'suites/tracing/mcp-server/**',
  'suites/tracing/mistral-v2/test.ts',
  'suites/tracing/mistral/test.ts',
  'suites/tracing/mongodb-v4/test.ts',
  'suites/tracing/mongodb-v5/test.ts',
  'suites/tracing/mongodb-v6/test.ts',
  'suites/tracing/mongodb-v7/test.ts',
  'suites/tracing/mongodb/test.ts',
  'suites/tracing/mongoose-tracing-channel/test.ts',
  'suites/tracing/mongoose-v5/test.ts',
  'suites/tracing/mongoose-v7/test.ts',
  'suites/tracing/mongoose-v8/test.ts',
  'suites/tracing/mongoose-v9/test.ts',
  'suites/tracing/mongoose/test.ts',
  'suites/tracing/mysql/test.ts',
  'suites/tracing/mysql2-tracing-channel/test.ts',
  'suites/tracing/mysql2/test.ts',
  'suites/tracing/neon/test.ts',
  'suites/tracing/openai/v5/**',
  'suites/tracing/openai/v6/test.ts',
  'suites/tracing/openai/v7/test.ts',
  'suites/tracing/orchestrion-lazy-registration/test.ts',
  'suites/tracing/pi-ai/test.ts',
  'suites/tracing/pi-durable/test.ts',
  'suites/tracing/postgres/test.ts',
  'suites/tracing/postgresjs/test.ts',
  'suites/tracing/prisma-orm-v5/test.ts',
  'suites/tracing/prisma-orm-v6/test.ts',
  'suites/tracing/prisma-orm-v7/test.ts',
  'suites/tracing/prisma-orm-v8/test.ts',
  'suites/tracing/redis-cache/test.ts',
  'suites/tracing/redis-dc/test.ts',
  'suites/tracing/redis/test.ts',
  'suites/tracing/tedious/test.ts',
  'suites/tracing/together-ai/test.ts',
  'suites/tracing/together-ai/v1/test.ts',
  'suites/tracing/typesafe/test.ts',
  'suites/tracing/vercelai/**',
];

// Bun reports other stack frames than Node: the column of `new Error()` points at `Error`, not
// `new`, and the top-level frame of a CommonJS module is `<anonymous>`, not `Object.?`.
const BUN_STACK_FRAMES_DIFFER = ['suites/contextLines/filename-with-spaces/test.ts'];

// The CJS and ESM cases need Express to capture the route error, which `bun run` does not
// instrument. A bundled app does not help: it has no `require.cache`, and the isolated packages
// are inlined, so the module versions do not match.
const MODULES_NEED_UNBUNDLED_EXPRESS = ['suites/modules/test.ts'];

// The scenario configures `nativeNodeFetchIntegration`, which `@sentry/bun` does not export.
const NO_NATIVE_NODE_FETCH_INTEGRATION = [
  'suites/tracing/http-client-spans/fetch-forward-request-hook/test.ts',
  'suites/tracing/http-client-spans/fetch-headers-to-span-attributes/test.ts',
  'suites/tracing/requests/fetch-no-trace-propagation/test.ts',
  'suites/tracing/requests/fetch-no-tracing-no-spans/test.ts',
];

// The `fetchIntegration` of `@sentry/bun` comes from `@sentry/core`. Its spans, breadcrumbs and
// `sentry-trace` headers differ from the ones `@sentry/node` creates, for example the span origin
// is `auto.http.fetch`, not `auto.http.node_fetch`, and the spans have no `url.path`, so
// `ignoreSpans` cannot match them on it.
const FETCH_INTEGRATION_DIFFERS = [
  'suites/tracing/double-baggage/spans-parent/test.ts',
  'suites/tracing/http-client-spans/fetch-basic/test.ts',
  'suites/tracing/http-client-spans/fetch-error/test.ts',
  'suites/tracing/http-client-spans/fetch-strip-query/test.ts',
  'suites/tracing/ignoreSpans/continued-trace-http-client/test.ts',
  'suites/tracing/requests/fetch-breadcrumbs/test.ts',
  'suites/tracing/requests/fetch-sampled-no-active-span/test.ts',
];

// `@sentry/bun` creates `http.server` spans with `bunHttpServerIntegration`, not `httpIntegration`.
// Its spans differ: response headers become attributes, there is no `http.response.status_text`,
// and the span name has no route. A server that sets `emit` back to the `emit` it had before its
// first request gets no spans after that. And an error that reaches the server does not mark
// the request session as crashed.
const HTTP_SERVER_SPANS_DIFFER = [
  'suites/sessions/server-without-process-session/test.ts',
  'suites/tracing/httpIntegration/test.ts',
];

// With `@sentry/bun`, these suites fail only because they need Express spans or route names,
// which `bun run` does not create.
// See https://github.com/getsentry/sentry-javascript/issues/23882
const NO_EXPRESS_INSTRUMENTATION = [
  'suites/sessions/crashed-session-aggregate/test.ts',
  'suites/sessions/errored-session-aggregate/test.ts',
  'suites/tracing/httpIntegration-streamed/test.ts',
  'suites/tracing/ignoreSpans/attributes/test.ts',
  'suites/tracing/ignoreSpans/children/test.ts',
  'suites/tracing/ignoreSpans/continued-trace-child/test.ts',
  'suites/tracing/ignoreSpans/segments/test.ts',
  'suites/tracing/sampling/test.ts',
  'suites/tracing/traceid-recycling-with-spans/test.ts',
];

export const NODE_SUITES_EXCLUDE = [
  '**/node_modules/**',
  ...NODE_ONLY,
  ...NO_AUTO_INSTRUMENTATION,
  ...BUN_STACK_FRAMES_DIFFER,
  ...MODULES_NEED_UNBUNDLED_EXPRESS,
];

// Excluded only in the `node-suites` project, which runs the suites with `@sentry/node`.
export const SENTRY_NODE_EXCLUDE = [...NO_HTTP_SERVER_SPANS, ...NO_FETCH_INSTRUMENTATION];

// Excluded only in the `node-suites-sentry-bun` project, which maps `@sentry/node` to `@sentry/bun`.
// Bun answers nothing on a connection whose first request awaits anything while a second one is
// queued behind it, which the pipelined cases need. `packages/bun` runs the same cases against Bun's
// servers without those.
const BUN_DROPS_PIPELINED_REQUESTS = ['suites/tunnel/hardening/test.ts'];

// Before Bun 1.4, `require('../package.json')` in an ES module of `proxy` fails with `Cannot find
// module '../package.json' from ''` when `alias-sentry-bun.ts` wraps `Module._resolveFilename`.
// Excluded in `node-suites-sentry-bun` only before Bun 1.4.
export const SENTRY_BUN_BEFORE_1_4_EXCLUDE = ['suites/proxy/test.ts'];

export const SENTRY_BUN_EXCLUDE = [
  ...BUN_DROPS_PIPELINED_REQUESTS,
  ...HTTP_SERVER_SPANS_DIFFER,
  ...NO_EXPRESS_INSTRUMENTATION,
  ...NO_NATIVE_NODE_FETCH_INTEGRATION,
  ...FETCH_INTEGRATION_DIFFERS,
];

// The build project (`node-suites-bun-build`) runs the suites of `NO_AUTO_INSTRUMENTATION` with the
// scenarios bundled by `@sentry/bun/plugin`. These do not run there.

// On Bun the channel integrations subscribe at `init()` by design, and this suite checks that
// they wait until their module loads.
const BUN_BUILD_EAGER_SUBSCRIPTION = ['suites/tracing/orchestrion-lazy-registration/test.ts'];

// The first `init()` has no DSN, so `bunHttpServerIntegration` is not set up, and the suite then
// adds only `httpIntegration`. On Bun that does not isolate requests, because Bun does not publish
// `http.server.request.start`.
const BUN_BUILD_NO_HTTP_SERVER_INTEGRATION = ['suites/express/multiple-init/test.ts'];

// `@mistralai/mistralai` v3 statically imports its optional peer `@livekit/rtc-node`, so Bun cannot
// bundle the scenarios. `mistral-v2` still covers Mistral here.
//
// `mongodb` v3 (also a dependency of `mongoose` v5) loads `optional-require`, whose `require-at`
// dependency calls `eval("require")`. Bun's ESM output gives a direct `eval` in a bundled CommonJS
// file no `require`, so the bundle throws `require is not defined`.
// See https://github.com/oven-sh/bun/issues/14891
//
// The CommonJS build of `together-ai` 0.x requires its optional peer `parquetjs`, so Bun cannot
// bundle the CJS scenario. `together-ai/v1` still covers Together here.
const BUN_BUILD_UNBUNDLEABLE_DEPENDENCY = [
  'suites/tracing/mistral/test.ts',
  'suites/tracing/mongodb/test.ts',
  'suites/tracing/mongoose-v5/test.ts',
  'suites/tracing/together-ai/test.ts',
];

// The library loads a module at runtime, which the bundle does not contain, so the build plugin
// does not instrument it. LangChain `initChatModel` calls `import(config.package)` to load the
// provider. The Mastra integration loads `@mastra/observability` when the app configures no
// observability.
const BUN_BUILD_RUNTIME_LOADED_MODULE = [
  'suites/tracing/langchain/v1/tracing/test.ts',
  'suites/tracing/mastra/core/observability/test.ts',
];

// The suite tests `@sentry/hono/node`, which builds on `@sentry/node` and creates no `http.server`
// spans on Bun. `@sentry/hono/bun` takes its options in `sentry(app, options)` instead of a separate
// `init()`, so the scenario cannot use it. `suites/hono-sdk` in this package tests `@sentry/hono/bun`.
const HONO_NODE_SDK = ['suites/hono-sdk/test.ts'];

// Before Bun 1.4, Bun does not publish `http.client.request.created`, and `@sentry/node` picks the
// channel from the Node version that Bun reports. So outgoing `node:http` requests get no
// `sentry-trace` or `baggage` header.
// See https://github.com/getsentry/sentry-javascript/issues/26614
const BUN_1_3_NO_HTTP_CLIENT_CHANNEL = ['suites/express/sentry-trace/test.ts', 'suites/express/with-http/base/test.ts'];

// Bun 1.3 bundles these CommonJS scenarios into code that calls a `require_*` helper before it is
// defined, so the scenario throws `require_ai is not a function`. The ESM tests still pass.
const BUN_1_3_BUNDLES_CJS_OUT_OF_ORDER = [
  'suites/tracing/langchain/v1/decisions/test.ts',
  'suites/tracing/langgraph/v1/test.ts',
];

// `mongodb` v7 (also a dependency of `mongoose` v9) calls `isBuildingSnapshot()` from `node:v8`,
// which Bun 1.3 does not implement, so the scenario throws `NotImplementedError`.
const BUN_1_3_NO_V8_IS_BUILDING_SNAPSHOT = [
  'suites/tracing/mongodb-v7/test.ts',
  'suites/tracing/mongoose-tracing-channel/test.ts',
  'suites/tracing/mongoose-v9/test.ts',
];

// Excluded in `node-suites-bun-build` only before Bun 1.4.
export const BUN_BUILD_BEFORE_1_4_EXCLUDE = [
  ...BUN_1_3_NO_HTTP_CLIENT_CHANNEL,
  ...BUN_1_3_BUNDLES_CJS_OUT_OF_ORDER,
  ...BUN_1_3_NO_V8_IS_BUILDING_SNAPSHOT,
];

export const BUN_BUILD_EXCLUDE = [
  '**/node_modules/**',
  // SQL Server runs in the dedicated Node/x86 CI job.
  'suites/tracing/tedious/test.ts',
  ...BUN_BUILD_EAGER_SUBSCRIPTION,
  ...BUN_BUILD_NO_HTTP_SERVER_INTEGRATION,
  ...BUN_BUILD_UNBUNDLEABLE_DEPENDENCY,
  ...BUN_BUILD_RUNTIME_LOADED_MODULE,
  ...HONO_NODE_SDK,
];

// The `bun run` project (`node-suites-bun-run`) runs the suites of `NO_AUTO_INSTRUMENTATION` with
// `@sentry/bun/import` preloaded, on Bun 1.4.6 or later. These do not run there.

export const BUN_RUN_EXCLUDE = [
  '**/node_modules/**',
  // SQL Server runs in the dedicated Node/x86 CI job.
  'suites/tracing/tedious/test.ts',
  // These fail for the same reasons as with the bundled scenarios.
  ...BUN_BUILD_EAGER_SUBSCRIPTION,
  ...BUN_BUILD_NO_HTTP_SERVER_INTEGRATION,
  ...HONO_NODE_SDK,
];
