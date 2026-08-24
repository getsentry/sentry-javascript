import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';

// `amqplib` splits its API across three files:
// - `lib/channel_model.js` holds `class Channel` (publish/consume/ack/nack/reject/…) and
//   `class ConfirmChannel extends Channel` (a `publish` that takes a broker-confirm callback).
// - `lib/channel.js` holds `class BaseChannel` whose `dispatchMessage` invokes the registered
//   consumer callback once per delivered message — the natural per-message hook for consumer spans
//   (`Channel.consume` itself only registers the callback, it isn't called per message).
// - `lib/connect.js` holds the `connect` function whose callback receives the open connection, used
//   to capture connection attributes.
//
// The version range mirrors `supportedVersions` in the vendored OTel instrumentation.
const module = { name: 'amqplib', versionRange: '>=0.5.5 <2' } as const;

export const amqplibConfig = [
  // Producer span + trace-header injection. `sendToQueue` delegates to `publish`, so it's covered.
  {
    channelName: 'publish',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'publish', kind: 'Sync' },
  },
  // Confirm-channel producer span; the trailing broker-confirm callback ends the span when the
  // broker acks/nacks. It internally calls `super.publish`, so the subscriber guards against the
  // base `publish` channel double-instrumenting.
  {
    channelName: 'confirmPublish',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'ConfirmChannel', methodName: 'publish', kind: 'Callback' },
  },
  // Records `consumerTag -> { noAck, queue }` so the per-message dispatch hook knows how to name and
  // when to end the consumer span.
  {
    channelName: 'consume',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'consume', kind: 'Async' },
  },
  // Per delivered message: creates the consumer span and runs the user callback under it.
  {
    channelName: 'dispatch',
    module: { ...module, filePath: 'lib/channel.js' },
    functionQuery: { className: 'BaseChannel', methodName: 'dispatchMessage', kind: 'Sync' },
  },
  // End the consumer span when the user settles the message.
  {
    channelName: 'ack',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'ack', kind: 'Sync' },
  },
  {
    channelName: 'nack',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'nack', kind: 'Sync' },
  },
  {
    channelName: 'reject',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'reject', kind: 'Sync' },
  },
  {
    channelName: 'ackAll',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'ackAll', kind: 'Sync' },
  },
  {
    channelName: 'nackAll',
    module: { ...module, filePath: 'lib/channel_model.js' },
    functionQuery: { className: 'Channel', methodName: 'nackAll', kind: 'Sync' },
  },
  // Stashes connection attributes (url/host/port/protocol/server product) on the connection object
  // for span-time reads via `channel.connection`.
  {
    channelName: 'connect',
    module: { ...module, filePath: 'lib/connect.js' },
    functionQuery: { functionName: 'connect', kind: 'Callback' },
  },
] satisfies InstrumentationConfig[];

export const amqplibModuleNames = getModuleNames(amqplibConfig);

export const amqplibChannels = {
  AMQPLIB_PUBLISH: 'orchestrion:amqplib:publish',
  AMQPLIB_CONFIRM_PUBLISH: 'orchestrion:amqplib:confirmPublish',
  AMQPLIB_CONSUME: 'orchestrion:amqplib:consume',
  AMQPLIB_DISPATCH: 'orchestrion:amqplib:dispatch',
  AMQPLIB_ACK: 'orchestrion:amqplib:ack',
  AMQPLIB_NACK: 'orchestrion:amqplib:nack',
  AMQPLIB_REJECT: 'orchestrion:amqplib:reject',
  AMQPLIB_ACK_ALL: 'orchestrion:amqplib:ackAll',
  AMQPLIB_NACK_ALL: 'orchestrion:amqplib:nackAll',
  AMQPLIB_CONNECT: 'orchestrion:amqplib:connect',
} as const;
