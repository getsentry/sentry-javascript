// Shared exports not using diagnostics channels
export { setHttpServerSpanRouteAttribute } from './utils/setHttpServerSpanRouteAttribute';
export { wrapServerRequestHandler } from './utils/wrapServerRequestHandler';
export type { ServerRequestHandlerConfig } from './utils/wrapServerRequestHandler';
export { setAsyncLocalStorageAsyncContextStrategy } from './async-context';
export { openTelemetryIntegration, getOtlpTracesEndpoint } from './opentelemetry';
export * from './ai';
export { getSqlQuerySummary, sanitizeSqlQuery, getSqlQueryAttributes } from './utils/sql';
export type { SqlDialect } from './utils/sql';
export { instrumentPostgresJsSql } from './integrations/postgresjs-wrapper';
export type { PostgresConnectionContext } from './integrations/postgresjs-wrapper';

// Shared, runtime-agnostic Hono instrumentation re-used by the `@sentry/hono` SDK across all runtimes.
// Sourced directly from their modules (not the `./integrations/hono` barrel, which also exports the
// diagnostics-channel-based `honoIntegration`) so the non-Node adapters can import them from the
// Node-free `@sentry/server-utils/no-diagnostic-channels` entry.
export { applyHonoPatches, earlyPatchHono } from './integrations/hono/applyPatches';
export { createHonoRequestMiddleware } from './integrations/hono/createHonoMiddleware';
export type { CreateHonoRequestMiddlewareOptions } from './integrations/hono/createHonoMiddleware';
export type { SentryHonoMiddlewareOptions } from './integrations/hono/types';
