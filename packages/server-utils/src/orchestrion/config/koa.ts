import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

// We instrument `koa-compose` rather than koa's `use` (in koa's main entry
// `lib/application.js`): transforming a package's main entry forces its top-level
// `require` chain through Node's `require(esm)` bridge, which throws on Node < 24.13.
// `koa-compose` is zero-dependency and its `compose()` is the funnel koa's `Application.callback()`
// uses to build the middleware chain.
export const koaConfig = [
  {
    channelName: 'compose',
    module: { name: 'koa-compose', versionRange: '>=4.0.0 <5', filePath: 'index.js' },
    functionQuery: { functionName: 'compose', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const koaChannels = {
  KOA_COMPOSE: 'orchestrion:koa-compose:compose',
} as const;
