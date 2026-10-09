import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `@neondatabase/serverless` ships as two minified esbuild bundles (`index.js` for CJS,
// `index.mjs` for ESM) that inline their own copy of `pg`. Class and function identifiers are
// mangled and differ between the two builds, so the name-based `functionQuery` matchers can't
// find anything. Every selector below keys on property names and string literals, which survive
// minification and are identical in both bundles.
const module = { name: '@neondatabase/serverless', versionRange: '>=1.0.0 <2', filePath: /^index\.m?js$/ };

export const neonConfig = [
  // The bundled pg `Client.prototype.query` (WebSocket driver). `_pulseQueryQueue` is a pg
  // internal that only `Client` defines, which keeps the pool and wire-protocol `query` methods
  // out. `methodName` is ignored for matching (`astQuery` wins) but makes the transformer emit a
  // method wrapper that exposes `self`, which carries `connectionParameters`.
  {
    channelName: 'query',
    module,
    astQuery:
      'ClassBody:has(MethodDefinition[key.name="_pulseQueryQueue"]) > MethodDefinition[key.name="query"] > FunctionExpression',
    functionQuery: { methodName: 'query', kind: 'Auto' },
  },
  // The HTTP executor nested inside `neon()`. Every HTTP query funnels through it: lazy
  // `NeonQueryPromise`s call it from `then`/`catch`/`finally`, and `transaction()` calls it once
  // with the whole batch, so wrapping it gives one span per request with no double counting.
  {
    channelName: 'http-query',
    module,
    astQuery: 'FunctionDeclaration[async=true]:has(Literal[value="Neon-Connection-String"])',
    functionQuery: { kind: 'Async' },
  },
  // `resolveConnectionParams`, awaited by the HTTP executor. The connection string lives in the
  // `neon()` closure and never reaches the executor's channel context, so the subscriber reads
  // `server.address`/`db.namespace` from this call's result instead, inside the query span.
  {
    channelName: 'resolve-connection',
    module,
    astQuery:
      'FunctionDeclaration[async=true]:has(ReturnStatement > ObjectExpression > Property[key.name="resolvedURL"])',
    functionQuery: { kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const neonModuleNames = getModuleNames(neonConfig);

export const neonChannels = {
  NEON_QUERY: 'orchestrion:@neondatabase/serverless:query',
  NEON_HTTP_QUERY: 'orchestrion:@neondatabase/serverless:http-query',
  NEON_RESOLVE_CONNECTION: 'orchestrion:@neondatabase/serverless:resolve-connection',
} as const;
