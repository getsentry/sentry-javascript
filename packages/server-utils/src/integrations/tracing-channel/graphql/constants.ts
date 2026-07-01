/*
 * Constants ported from `@opentelemetry/instrumentation-graphql`, kept OTel-free.
 * Span names/attribute names are preserved verbatim so spans match the OTel integration's output
 * (existing tests, dashboards, and the SDK's span-description parsing all key off these).
 */

export const enum SpanNames {
  EXECUTE = 'graphql.execute',
  PARSE = 'graphql.parse',
  RESOLVE = 'graphql.resolve',
  VALIDATE = 'graphql.validate',
  SCHEMA_VALIDATE = 'graphql.validateSchema',
  SCHEMA_PARSE = 'graphql.parseSchema',
}

// graphql `source`/`field.*`are OTel-specific keys preserved for span parity.
// `graphql.operation.{name,type}` and `sentry.graphql.operation` come from `@sentry/conventions/attributes` instead
export const enum AttributeNames {
  SOURCE = 'graphql.source',
  FIELD_NAME = 'graphql.field.name',
  FIELD_PATH = 'graphql.field.path',
  FIELD_TYPE = 'graphql.field.type',
  PARENT_NAME = 'graphql.field.parentName',
}

export const enum TokenKind {
  STRING = 'String',
  INT = 'Int',
  FLOAT = 'Float',
  BLOCK_STRING = 'BlockString',
  EOF = '<EOF>',
}

export const ORIGIN = 'auto.graphql.orchestrion.graphql';

// `Symbol.for` keys are shared with any co-resident OTel graphql instrumentation on purpose: the two
// paths are mutually exclusive at runtime, and reusing the key keeps nested-execute detection and
// resolver parenting consistent if both ever load.
export const GRAPHQL_DATA_SYMBOL = Symbol.for('opentelemetry.graphql_data');
export const GRAPHQL_PATCHED_SYMBOL = Symbol.for('opentelemetry.patched');
