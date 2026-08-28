import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

export const hapiConfig = [
  // hapi's `route`/`ext` live on an anonymous class (`internals.Server = class {}`),
  // so `{className}` can't match — `{methodName}` targets them in lib/server.js. Both
  // are synchronous void methods, so `Sync` suffices: we only use `start` to swap
  // handlers in `ctx.arguments`. Shape verified across the whole range.
  {
    channelName: 'route',
    module: { name: '@hapi/hapi', versionRange: '>=17.0.0 <22.0.0', filePath: 'lib/server.js' },
    functionQuery: { methodName: 'route', kind: 'Sync' },
  },
  {
    channelName: 'ext',
    module: { name: '@hapi/hapi', versionRange: '>=17.0.0 <22.0.0', filePath: 'lib/server.js' },
    functionQuery: { methodName: 'ext', kind: 'Sync' },
  },
  // `start`/`initialize` give us the live server via `ctx.self` so we can attach
  // the error listener automatically. We hook both because `start()` calls the
  // private `_core._start()` (never the public `initialize` method), while
  // test/serverless flows may only call `initialize()`. Only the synchronous
  // `start` event is used — to read `ctx.self` — so `Sync` suffices even though
  // both methods return a promise.
  {
    channelName: 'start',
    module: { name: '@hapi/hapi', versionRange: '>=17.0.0 <22.0.0', filePath: 'lib/server.js' },
    functionQuery: { methodName: 'start', kind: 'Sync' },
  },
  {
    channelName: 'initialize',
    module: { name: '@hapi/hapi', versionRange: '>=17.0.0 <22.0.0', filePath: 'lib/server.js' },
    functionQuery: { methodName: 'initialize', kind: 'Sync' },
  },
] satisfies InstrumentationConfig[];

export const hapiModuleNames = getModuleNames(hapiConfig);

export const hapiChannels = {
  HAPI_ROUTE: 'orchestrion:@hapi/hapi:route',
  HAPI_EXT: 'orchestrion:@hapi/hapi:ext',
  HAPI_START: 'orchestrion:@hapi/hapi:start',
  HAPI_INITIALIZE: 'orchestrion:@hapi/hapi:initialize',
} as const;
