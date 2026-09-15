import type { InstrumentationConfig } from '../apmTypes';
import { getModuleNames } from './module-names';

// Users construct their app with `new Hono()`, but we hook the constructor of its BASE class
// `HonoBase` (in `dist/hono-base.js` / `dist/cjs/hono-base.js`, where the class is written `Hono`)
// rather than the `Hono` subclass in `dist/hono.js`. `new Hono()` calls `super()`, so the base
// constructor's `end` still exposes the app instance as `self`. Wrapping the base — not the derived —
// constructor is deliberate: the transform wraps the constructor body in a closure and reads `this`
// in a `finally`, which Bun's JSC engine rejects for a DERIVED constructor ("'super()' must be called
// before accessing |this|") but accepts for a base constructor. See `honoIntegration`'s `end` handler
// for how the mid-`super()` timing (the app's `router` is not set until the `Hono` subclass body runs
// after `super()` returns) is bridged. `className` is the selector (no `methodName` → the class
// constructor); the subscriber tolerates anything that is not a Hono app.
const honoConstructorConfig: InstrumentationConfig[] = [
  {
    channelName: 'honoConstructor',
    module: { name: 'hono', versionRange: '>=4.0.0 <5', filePath: /^dist\/(?:cjs\/)?hono-base\.js$/ },
    functionQuery: { className: 'Hono' },
  },
];

export const honoConfig = honoConstructorConfig satisfies InstrumentationConfig[];

export const honoModuleNames = getModuleNames(honoConfig);

export const honoChannels = {
  HONO_CONSTRUCTOR: 'orchestrion:hono:honoConstructor',
} as const;
