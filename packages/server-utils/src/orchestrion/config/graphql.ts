import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

// `parse`/`validate`/`execute` are top-level named `function` declarations in graphql's compiled
// files, stable across the supported majors, so `functionName` matches. `execute` returns
// `PromiseOrValue`, so `Auto` covers both async (settles on `asyncEnd`) and sync (`end`) schemas.
export const graphqlConfig = [
  {
    channelName: 'parse',
    module: { name: 'graphql', versionRange: '>=14.0.0 <17', filePath: 'language/parser.js' },
    functionQuery: { functionName: 'parse', kind: 'Sync' },
  },
  {
    channelName: 'validate',
    module: { name: 'graphql', versionRange: '>=14.0.0 <17', filePath: 'validation/validate.js' },
    functionQuery: { functionName: 'validate', kind: 'Sync' },
  },
  {
    channelName: 'execute',
    module: { name: 'graphql', versionRange: '>=14.0.0 <17', filePath: 'execution/execute.js' },
    functionQuery: { functionName: 'execute', kind: 'Auto' },
  },
] satisfies InstrumentationConfig[];

export const graphqlChannels = {
  GRAPHQL_PARSE: 'orchestrion:graphql:parse',
  GRAPHQL_VALIDATE: 'orchestrion:graphql:validate',
  GRAPHQL_EXECUTE: 'orchestrion:graphql:execute',
} as const;
