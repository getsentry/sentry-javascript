/*
 * Shared by both graphql paths — the orchestrion one (graphql v14–16) and the native
 * `diagnostics_channel` subscriber (graphql >= 17) — so they emit identical spans: same origin, span
 * names, processing types and field-attribute keys. `graphql.document`/`graphql.operation.*` and the
 * span `op` come from `@sentry/conventions` directly and are imported where used.
 *
 * The `graphql:*` channel names live in `graphql-dc-subscriber.ts` instead: only that path uses them,
 * and they are hardcoded there so it never has to import graphql itself.
 */

export const ORIGIN = 'auto.graphql.diagnostic_channel';

export const SPAN_NAME_PARSE = 'graphql.parse';
export const SPAN_NAME_VALIDATE = 'graphql.validate';
export const SPAN_NAME_EXECUTE = 'graphql.execute';
// Only graphql >= 17 publishes a subscribe channel; v14–16 routes subscriptions through `execute`.
export const SPAN_NAME_SUBSCRIBE = 'graphql.subscribe';
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

// Field-level resolver-span attributes; not in `@sentry/conventions`. These match the keys the
// vendored OTel instrumentation emitted, so upgrading users see no attribute rename.
export const GRAPHQL_FIELD_NAME = 'graphql.field.name';
export const GRAPHQL_FIELD_PATH = 'graphql.field.path';
export const GRAPHQL_FIELD_TYPE = 'graphql.field.type';
export const GRAPHQL_PARENT_NAME = 'graphql.parent.name';

// `Symbol.for` keys shared with any co-resident OTel graphql instrumentation on purpose: the paths are
// mutually exclusive at runtime, and reusing the key keeps nested-execute detection and resolver
// parenting consistent if both ever load.
export const GRAPHQL_DATA_SYMBOL = Symbol.for('opentelemetry.graphql_data');
export const GRAPHQL_PATCHED_SYMBOL = Symbol.for('opentelemetry.patched');
