// Shared exports not using diagnostics channels
export { setHttpServerSpanRouteAttribute } from './utils/setHttpServerSpanRouteAttribute';
export { setAsyncLocalStorageAsyncContextStrategy } from './async-context';
export { openTelemetryIntegration, getOtlpTracesEndpoint } from './opentelemetry';
export * from './ai';
export { getSqlQuerySummary, sanitizeSqlQuery, sanitizeSqlQueryWithSummary } from './utils/sql';
export type { SqlDialect } from './utils/sql';
export { instrumentPostgresJsSql } from './integrations/postgresjs';
export type { PostgresConnectionContext } from './integrations/postgresjs';

// Shared, runtime-agnostic Hono instrumentation re-used by the `@sentry/hono` SDK across all runtimes.
// Sourced directly from their modules (not the `./integrations/hono` barrel, which also exports the
// diagnostics-channel-based `honoIntegration`) so the non-Node adapters can import them from the
// Node-free `@sentry/server-utils/no-diagnostic-channels` entry.
export { applyHonoPatches, earlyPatchHono } from './integrations/hono/applyPatches';
export { createHonoRequestMiddleware } from './integrations/hono/createHonoMiddleware';
export type { CreateHonoRequestMiddlewareOptions } from './integrations/hono/createHonoMiddleware';
export type { SentryHonoMiddlewareOptions } from './integrations/hono/types';
