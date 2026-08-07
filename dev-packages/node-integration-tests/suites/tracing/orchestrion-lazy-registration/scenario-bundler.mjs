import { strict as assert } from 'node:assert';
import { tracingChannel } from 'node:diagnostics_channel';
import { orchestrionModuleInjected } from '@sentry/server-utils/orchestrion';

// Reproduces the force-bundled path (vite SSR, nextjs's bundle-safe packages):
// the module is transformed at BUILD time and inlined, so it is never loaded
// through the runtime module hook. Instead, the bundler transform splices a
// snippet into the module that calls `orchestrionModuleInjected` when the
// module is evaluated, which must trigger the lazy channel subscription. We
// simulate that snippet here, WITHOUT ever importing generic-pool.

const channel = tracingChannel('orchestrion:generic-pool:acquire');

// `init()` (in instrument.mjs) registered the lazy listener, but nothing is
// injected yet, so the channel has no subscriber.
const marker = globalThis.__SENTRY_ORCHESTRION__;
assert.ok(marker, 'expected __SENTRY_ORCHESTRION__ marker to exist after init');
assert.equal(
  channel.start.hasSubscribers,
  false,
  'expected NO subscribers before the injected snippet announces the module',
);

// Simulate the snippet the bundler transform injected into generic-pool: in a
// real build this runs when the bundled module is first evaluated.
orchestrionModuleInjected('generic-pool');

assert.ok(marker.bundler?.includes('generic-pool'), 'expected the module to be recorded as bundler-injected');

// The helper emitted `orchestrion.module-injected`, so the GenericPool
// integration must have subscribed, even though generic-pool was never loaded
// through the module hook.
assert.equal(
  channel.start.hasSubscribers,
  true,
  'expected subscribers after the injected snippet announced the module',
);
