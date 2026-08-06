import type { InstrumentationConfig } from '..';
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
] satisfies InstrumentationConfig[];

export const hapiModuleNames = getModuleNames(hapiConfig);

export const hapiChannels = {
  HAPI_ROUTE: 'orchestrion:@hapi/hapi:route',
  HAPI_EXT: 'orchestrion:@hapi/hapi:ext',
} as const;
