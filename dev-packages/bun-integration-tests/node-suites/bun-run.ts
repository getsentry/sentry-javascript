// Preloaded by the `node-suites-bun-run` project: maps `@sentry/node` to `@sentry/bun`, and
// registers the `bun run` instrumentation before the scenario loads, as users do with
// `bun --preload @sentry/bun/import`.
import './alias-sentry-bun';
import '@sentry/bun/import';
