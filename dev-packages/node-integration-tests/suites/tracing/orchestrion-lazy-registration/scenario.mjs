import { strict as assert } from 'node:assert';
import { tracingChannel } from 'node:diagnostics_channel';

// `generic-pool` is a default channel integration and a pure, service-free
// require, so loading it is enough to trigger the runtime hook's injection.
const channel = tracingChannel('orchestrion:generic-pool:acquire');

// After `init()` but BEFORE `generic-pool` is loaded, a lazily-registering
// integration must not have subscribed to the channel yet — otherwise every
// default channel integration would consume channel slots up front (Node caps
// channels in use at 1024), even for modules the app never loads.
assert.equal(
  channel.start.hasSubscribers,
  false,
  'expected NO subscribers on orchestrion:generic-pool:acquire before generic-pool is loaded',
);

// Loading the module triggers the runtime hook to inject it, which is the point
// at which the integration should wire up its channel subscriber.
await import('generic-pool');

assert.equal(
  channel.start.hasSubscribers,
  true,
  'expected subscribers on orchestrion:generic-pool:acquire after generic-pool is loaded',
);
