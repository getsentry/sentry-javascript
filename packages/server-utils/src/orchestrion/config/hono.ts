import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Users construct their app with `new Hono()` from the `hono` package's main entry, whose `Hono`
// class lives in `dist/hono.js` (ESM) and `dist/cjs/hono.js` (CJS). Hooking the constructor lets the
// integration auto-register the Sentry middleware on every app instance: the channel's `end` message
// exposes the constructed app as `self`. `className` is the selector (no `methodName` → the class
// constructor); the subscriber tolerates anything that is not a Hono app.
const honoConstructorConfig: InstrumentationConfig[] = [
  {
    channelName: 'honoConstructor',
    module: { name: 'hono', versionRange: '>=4.0.0 <5', filePath: /^dist\/(?:cjs\/)?hono\.js$/ },
    functionQuery: { className: 'Hono' },
  },
];

export const honoConfig = honoConstructorConfig satisfies InstrumentationConfig[];

export const honoModuleNames = getModuleNames(honoConfig);

export const honoChannels = {
  HONO_CONSTRUCTOR: 'orchestrion:hono:honoConstructor',
} as const;
