/*
 * These mirror the constants in `@sentry/server-utils`'s native graphql subscriber
 * (`src/graphql/graphql-dc-subscriber.ts`) so the orchestrion path (graphql v14–16) and the native
 * `diagnostics_channel` path (graphql >= 17) emit identical spans — same origin, span names and
 * field-attribute keys. `graphql.document`/`graphql.operation.*` and the span `op` come from
 * `@sentry/conventions` directly and are imported where used.
 */

export const ORIGIN = 'auto.graphql.diagnostic_channel';

export const SPAN_NAME_PARSE = 'graphql.parse';
export const SPAN_NAME_VALIDATE = 'graphql.validate';
export const SPAN_NAME_EXECUTE = 'graphql.execute';
export const SPAN_NAME_RESOLVE = 'graphql.resolve';

// Span names used when span streaming is enabled, mirroring the same block in the native subscriber.
// The conventions name graphql spans `GraphQL {graphql.operation.type}`, and these phases are being
// added to that attribute's values, so a parse, validate or resolve span keeps a name of its own
// rather than taking the generic `GRAPHQL_SPAN_NAME_FALLBACK`.
export const STREAMED_SPAN_NAME_PARSE = 'GraphQL parse';
export const STREAMED_SPAN_NAME_VALIDATE = 'GraphQL validate';
export const STREAMED_SPAN_NAME_RESOLVE = 'GraphQL resolve';

// Field-level resolver-span attributes; not in `@sentry/conventions`.
export const GRAPHQL_FIELD_NAME = 'graphql.field.name';
export const GRAPHQL_FIELD_PATH = 'graphql.field.path';
export const GRAPHQL_FIELD_TYPE = 'graphql.field.type';
export const GRAPHQL_PARENT_NAME = 'graphql.parent.name';

// `Symbol.for` keys shared with any co-resident OTel graphql instrumentation on purpose: the paths are
// mutually exclusive at runtime, and reusing the key keeps nested-execute detection and resolver
// parenting consistent if both ever load.
export const GRAPHQL_DATA_SYMBOL = Symbol.for('opentelemetry.graphql_data');
export const GRAPHQL_PATCHED_SYMBOL = Symbol.for('opentelemetry.patched');
