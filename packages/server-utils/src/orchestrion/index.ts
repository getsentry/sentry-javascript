export { detectOrchestrionSetup } from './detect';
export { mysqlChannelIntegration } from '../integrations/tracing-channel/mysql';
export { lruMemoizerChannelIntegration } from '../integrations/tracing-channel/lru-memoizer';
export { graphqlChannelIntegration } from '../integrations/tracing-channel/graphql';
export type { GraphqlChannelIntegrationOptions } from '../integrations/tracing-channel/graphql';

// The structural `graphql` package types are the single source of truth shared with `@sentry/node`'s
// vendored OTel graphql instrumentation
export type * from '../integrations/tracing-channel/graphql/graphql-types';
