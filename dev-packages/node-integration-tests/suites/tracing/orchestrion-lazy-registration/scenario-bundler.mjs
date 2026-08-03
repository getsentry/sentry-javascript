import { strict as assert } from 'node:assert';
import { tracingChannel } from 'node:diagnostics_channel';

// Reproduces the force-bundled path (vite SSR, nextjs's bundle-safe packages):
// the module is transformed at BUILD time and inlined, so it is never loaded
// through the runtime module hook and its `orchestrion.module-runtime-injected`
// event never fires. Instead the bundler's `injectDiagnostics` boot banner sets
// `.bundler` and calls the on-inject bridge, which must trigger the lazy
// channel subscription. We simulate that banner here, WITHOUT ever importing
// generic-pool.

const channel = tracingChannel('orchestrion:generic-pool:acquire');

// `init()` (in instrument.mjs) installed the bridge and registered the lazy
// listener, but nothing is injected yet, so the channel has no subscriber.
const marker = globalThis.__SENTRY_ORCHESTRION__;
assert.ok(marker, 'expected __SENTRY_ORCHESTRION__ marker to exist after init');
assert.equal(typeof marker.onInject, 'function', 'expected the on-inject bridge to be installed by init()');
assert.equal(
  channel.start.hasSubscribers,
  false,
  'expected NO subscribers before the bundler banner announces the module',
);

// Simulate the bundler's `injectDiagnostics` boot banner: record the bundled
// module and fire the bridge for it. In a real build this runs when the app
// bundle boots, after `init()`.
marker.bundler = ['generic-pool'];
marker.onInject('generic-pool');

// The bridge re-emitted `orchestrion.module-runtime-injected`, so the
// GenericPool integration must have subscribed, even though generic-pool was
// never loaded through the module hook.
assert.equal(
  channel.start.hasSubscribers,
  true,
  'expected subscribers after the bundler banner fired the on-inject bridge',
);
