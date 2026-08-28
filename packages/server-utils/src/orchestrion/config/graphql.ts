import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `parse`/`validate`/`execute` are top-level named `function` declarations in graphql's compiled
// files, stable across the supported majors, so `functionName` matches. `execute` returns
// `PromiseOrValue`, so `Auto` covers both async (settles on `asyncEnd`) and sync (`end`) schemas.
// graphql ships dual CJS/ESM and the matcher compares `filePath` exactly, hence one entry per built
// file (`.js` for `require`, `.mjs` for `import`) — a bundler resolving the ESM build (e.g. webpack
// with `outputModule`) would otherwise never be transformed.
export const graphqlConfig = [
  ...['language/parser.js', 'language/parser.mjs'].map(filePath => ({
    channelName: 'parse',
    module: { name: 'graphql', versionRange: '>=14.0.0 <17', filePath },
    functionQuery: { functionName: 'parse', kind: 'Sync' as const },
  })),
  ...['validation/validate.js', 'validation/validate.mjs'].map(filePath => ({
    channelName: 'validate',
    module: { name: 'graphql', versionRange: '>=14.0.0 <17', filePath },
    functionQuery: { functionName: 'validate', kind: 'Sync' as const },
  })),
  ...['execution/execute.js', 'execution/execute.mjs'].map(filePath => ({
    channelName: 'execute',
    module: { name: 'graphql', versionRange: '>=14.0.0 <17', filePath },
    functionQuery: { functionName: 'execute', kind: 'Auto' as const },
  })),
] satisfies InstrumentationConfig[];

export const graphqlChannels = {
  GRAPHQL_PARSE: 'orchestrion:graphql:parse',
  GRAPHQL_VALIDATE: 'orchestrion:graphql:validate',
  GRAPHQL_EXECUTE: 'orchestrion:graphql:execute',
} as const;

export const graphqlModuleNames = getModuleNames(graphqlConfig);
