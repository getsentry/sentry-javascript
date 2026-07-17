import type { InstrumentationConfig } from '..';
import { toSubscribeInjections } from './subscribe-injection';

// Two shapes of `acquire`, both publishing to the same `orchestrion:generic-pool:acquire` channel:
// - v3+: `class Pool { acquire(priority) }` returns a promise, so `kind: 'Auto'` resolves to `wrapPromise`.
// - v2.4–v3: `Pool.prototype.acquire = function acquire(callback, priority)` is callback-based.
// Versions before 2.4 assigned an anonymous `acquire` per pool instance (a factory), which a static
// transform can't target, so they're out of scope (matching how the OTel instrumentation split them).
export const genericPoolConfig = [
  {
    channelName: 'acquire',
    module: { name: 'generic-pool', versionRange: '>=3.0.0 <4', filePath: 'lib/Pool.js' },
    functionQuery: { className: 'Pool', methodName: 'acquire', kind: 'Auto' },
  },
  {
    channelName: 'acquire',
    module: { name: 'generic-pool', versionRange: '>=2.4.0 <3', filePath: 'lib/generic-pool.js' },
    functionQuery: { expressionName: 'acquire', kind: 'Callback' },
  },
] satisfies InstrumentationConfig[];

export const genericPoolChannels = {
  GENERIC_POOL_ACQUIRE: 'orchestrion:generic-pool:acquire',
} as const;

export const genericPoolSubscribeInjection = toSubscribeInjections(genericPoolConfig);
