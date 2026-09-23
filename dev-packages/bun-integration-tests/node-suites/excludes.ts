// Node suites that do not run on Bun, relative to `node-integration-tests`. A single test that
// fails on Bun is skipped with `test.skipIf` on `RUNTIME` in the Node suite, not listed here.

// Node-only features: ANR and native thread watchdogs, child processes, the AWS Lambda Node runtime.
const NODE_ONLY = [
  'suites/anr/test.ts',
  'suites/aws-serverless/**',
  'suites/breadcrumbs/**',
  'suites/child-process/test.ts',
  'suites/thread-blocked-native/test.ts',
];

// Bun does not publish `http.server.request.start`, so `@sentry/node` creates no `http.server`
// span and does not isolate incoming requests. `@sentry/bun` has `bunHttpServerIntegration` for this.
const NO_HTTP_SERVER_SPANS = [
  'suites/sessions/**',
  'suites/tracing/envelope-header/sampleRate-propagation/test.ts',
  'suites/tracing/httpIntegration-streamed/test.ts',
  'suites/tracing/httpIntegration/test.ts',
  'suites/tracing/httpServerSpans-streamed-unrouted/test.ts',
  'suites/tracing/ignoreSpans-streamed/**',
  'suites/tracing/meta-tags-twp-errors/test.ts',
  'suites/tracing/meta-tags/test.ts',
  'suites/tracing/requestData-streamed/test.ts',
  'suites/tracing/sample-rand-propagation/test.ts',
  'suites/tracing/sample-rate-propagation/**',
  'suites/tracing/sampling-static/test.ts',
  'suites/tracing/sampling-streamed/test.ts',
  'suites/tracing/traceid-recycling-with-spans/test.ts',
  'suites/tracing/traceid-recycling/test.ts',
];

// `@sentry/node` instruments `fetch` through undici's diagnostics channels, which Bun's `fetch`
// does not publish. `@sentry/bun` has its own `fetchIntegration` for this.
const NO_FETCH_INSTRUMENTATION = [
  'suites/tracing/double-baggage/**',
  'suites/tracing/http-client-span-streamed/test.ts',
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
  'suites/tracing/requests/fetch-unsampled/test.ts',
  'suites/tracing/requests/traceparent/test.ts',
];

// JS-3507: Bun 1.3.14 (the CI version) does not instrument outgoing `node:http` requests. These
// suites pass on Bun 1.4.2.
const NO_OUTGOING_HTTP_INSTRUMENTATION = [
  'suites/tracing/dsc-txn-name-update/test.ts',
  'suites/tracing/http-client-spans/http-basic/test.ts',
  'suites/tracing/http-client-spans/http-strip-query/test.ts',
  'suites/tracing/requests/http-breadcrumbs/test.ts',
  'suites/tracing/requests/http-maxed-out-sockets/test.ts',
  'suites/tracing/requests/http-no-trace-propagation/test.ts',
  'suites/tracing/requests/http-no-tracing-no-spans/test.ts',
  'suites/tracing/requests/http-no-tracing/test.ts',
  'suites/tracing/requests/http-sampled-no-active-span/test.ts',
  'suites/tracing/requests/http-sampled/test.ts',
  'suites/tracing/requests/http-unsampled/test.ts',
  'suites/tracing/tracePropagationTargets/**',
];

// JS-3508: `bun run` cannot inject the diagnostics channels into libraries, so framework,
// database and AI instrumentation creates no spans. Apps must be built with `@sentry/bun/plugin`.
const NO_AUTO_INSTRUMENTATION = [
  'suites/express/**',
  'suites/fs-instrumentation/test.ts',
  'suites/hono-sdk/test.ts',
  'suites/pino/test.ts',
  'suites/tracing/amqplib/test.ts',
  'suites/tracing/anthropic/test.ts',
  'suites/tracing/apollo-graphql/**',
  'suites/tracing/dataloader/test.ts',
  'suites/tracing/fastify/test.ts',
  'suites/tracing/genericPool-v2/test.ts',
  'suites/tracing/genericPool/test.ts',
  'suites/tracing/is-localhost/test.ts',
  'suites/tracing/google-genai-v2/test.ts',
  'suites/tracing/google-genai/test.ts',
  'suites/tracing/groq/test.ts',
  'suites/tracing/hapi/test.ts',
  'suites/tracing/ioredis-dc/test.ts',
  'suites/tracing/kafkajs/test.ts',
  'suites/tracing/knex/**',
  'suites/tracing/koa/test.ts',
  'suites/tracing/langchain/**',
  'suites/tracing/langgraph/test.ts',
  'suites/tracing/lru-memoizer/test.ts',
  'suites/tracing/mcp-handler-exact-once/test.ts',
  'suites/tracing/mcp-server-streamed/test.ts',
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
  'suites/tracing/openai/test.ts',
  'suites/tracing/openai/v6/test.ts',
  'suites/tracing/orchestrion-lazy-registration/test.ts',
  'suites/tracing/postgres-streamed/test.ts',
  'suites/tracing/postgres/test.ts',
  'suites/tracing/postgresjs-streamed/test.ts',
  'suites/tracing/postgresjs/test.ts',
  'suites/tracing/prisma-orm-v5/test.ts',
  'suites/tracing/prisma-orm-v6/test.ts',
  'suites/tracing/prisma-orm-v7/test.ts',
  'suites/tracing/redis-cache/test.ts',
  'suites/tracing/redis-dc/test.ts',
  'suites/tracing/redis/test.ts',
  'suites/tracing/tedious/test.ts',
  'suites/tracing/together-ai/test.ts',
  'suites/tracing/vercelai/**',
];

// Fail on Bun, cause not investigated yet. `system-error` and `tracer-start-active-span-error`
// fail on Bun 1.3.14 and pass on Bun 1.4.2. With the `@sentry/bun` alias, `system-error` also
// fails because `@sentry/bun` does not include `nodeSystemErrorIntegration`.
const NOT_TRIAGED = [
  'suites/contextLines/filename-with-spaces/test.ts',
  'suites/modules/test.ts',
  'suites/proxy/test.ts',
  'suites/system-error/test.ts',
  'suites/tracing/tracer-start-active-span-error/test.ts',
];

export const NODE_SUITES_EXCLUDE = [
  '**/node_modules/**',
  ...NODE_ONLY,
  ...NO_HTTP_SERVER_SPANS,
  ...NO_FETCH_INSTRUMENTATION,
  ...NO_OUTGOING_HTTP_INSTRUMENTATION,
  ...NO_AUTO_INSTRUMENTATION,
  ...NOT_TRIAGED,
];
