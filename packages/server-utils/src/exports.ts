// Shared exports not using diagnostics channels
export { setHttpServerSpanRouteAttribute } from './utils/setHttpServerSpanRouteAttribute';
export { setAsyncLocalStorageAsyncContextStrategy } from './async-context';
export { openTelemetryIntegration, getOtlpTracesEndpoint } from './opentelemetry';
export * from './ai';
export { getSqlQuerySummary, sanitizeSqlQuery } from './utils/sql';
export type { SqlDialect } from './utils/sql';
export { instrumentPostgresJsSql } from './integrations/postgresjs';
export type { PostgresConnectionContext } from './integrations/postgresjs';
