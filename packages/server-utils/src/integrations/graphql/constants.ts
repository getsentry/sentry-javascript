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

// Which part of request processing a span covers. Low-cardinality span names cannot carry the phase,
// so consumers read it here instead. Inlined until `@sentry/conventions` ships it
// (https://github.com/getsentry/sentry-conventions/pull/572).
export const GRAPHQL_PROCESSING_TYPE = 'graphql.processing.type';

export const PROCESSING_TYPE_PARSE = 'parse';
export const PROCESSING_TYPE_VALIDATE = 'validate';
// graphql-js `subscribe()` runs a subscription operation, so it is an execute too; the operation
// itself is told apart by `graphql.operation.type`.
export const PROCESSING_TYPE_EXECUTE = 'execute';
export const PROCESSING_TYPE_RESOLVE = 'resolve';

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
