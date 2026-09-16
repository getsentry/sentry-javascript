import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Users construct their app with `new Hono()`. We hook the `Hono` subclass constructor in
// `dist/hono.js` / `dist/cjs/hono.js` (`class Hono extends HonoBase`). Its `end` fires after the full
// constructor has run — `super()` plus `this.router = …` — so the app is exposed as `self` fully
// initialized (router set) and `app.use()` works immediately. `className` is the selector (no
// `methodName` → the class constructor); the subscriber tolerates anything that is not a Hono app.
//
// NOTE: The transform wraps the constructor body in a closure and reads `this` in a `finally`, which
// Bun's JSC engine rejects for a DERIVED constructor ("'super()' must be called before accessing
// |this|"). Wrapping this derived constructor therefore breaks Bun boot — tracked separately.
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
