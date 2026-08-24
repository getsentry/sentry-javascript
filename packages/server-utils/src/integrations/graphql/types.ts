/*
 * Implementation-specific graphql types for the orchestrion subscriber. The structural `graphql`
 * package types live in `./graphql-types` (the shared single source, re-exported here for convenience);
 * this file only adds the bookkeeping/config types that depend on this package's symbols.
 */

import type { Span } from '@sentry/core';
import type { GRAPHQL_DATA_SYMBOL, GRAPHQL_PATCHED_SYMBOL } from './constants';
import type { DocumentNode } from './graphql-types';

export type * from './graphql-types';

/** Bookkeeping we attach to `contextValue` to parent resolver spans under the execute span. */
interface GraphQLSpanData {
  source?: DocumentNode;
  span: Span;
  fields: Record<string, { span: Span } | undefined>;
}

export interface ObjectWithGraphQLData {
  [GRAPHQL_DATA_SYMBOL]?: GraphQLSpanData;
}

export interface Patched {
  [GRAPHQL_PATCHED_SYMBOL]?: boolean;
}

/** Resolved integration config (defaults applied), shared by the span + resolver builders. */
export interface GraphqlResolvedConfig {
  ignoreResolveSpans: boolean;
  ignoreTrivialResolveSpans: boolean;
  useOperationNameForRootSpan: boolean;
}

/** Minimal shape of a graphql-js lexer token, enough to locate literal spans for redaction. */
export interface GraphqlToken {
  kind: string;
  start: number;
  end: number;
  next?: GraphqlToken | null;
}

/** Minimal shape of a parsed graphql-js `DocumentNode`, enough to read its source and tokens. */
export interface GraphqlDocumentNode {
  loc?: {
    startToken?: GraphqlToken;
    source?: { body?: string };
  };
}
