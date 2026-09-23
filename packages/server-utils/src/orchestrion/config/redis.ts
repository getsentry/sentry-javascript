import type { InstrumentationConfig } from '../apmTypes';

import { getModuleNames } from './module-names';
import { registrationOnly } from './registration-only';

export const redisConfig = [
  registrationOnly({ name: '@redis/client', versionRange: '>=5.12.0', filePath: 'dist/lib/client/index.js' }),
  // redis `>=2.6.0 <4` (standalone `redis`). `internal_send_command` is an
  // anonymous prototype assignment (`expressionName`); it settles via the nested
  // `command_obj.callback`, so `kind: 'Sync'` and the subscriber wraps that callback.
  {
    channelName: 'command',
    module: { name: 'redis', versionRange: '>=2.6.0 <4', filePath: 'index.js' },
    functionQuery: { expressionName: 'internal_send_command', kind: 'Sync' },
  },
  // node-redis v4 (`@redis/client` v1). The real chokepoint (private `#sendCommand`)
  // isn't matchable, so wrap both public entry points: `commandsExecutor` (friendly
  // commands) and `sendCommand` (direct calls). They never overlap, so no double span.
  {
    channelName: 'executor',
    module: { name: '@redis/client', versionRange: '^1.0.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: 'commandsExecutor', kind: 'Async' },
  },
  {
    channelName: 'command',
    module: { name: '@redis/client', versionRange: '^1.0.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: 'sendCommand', kind: 'Async' },
  },
  {
    channelName: 'connect',
    module: { name: '@redis/client', versionRange: '^1.0.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: 'connect', kind: 'Async' },
  },
  // node-redis `>=5.0.0 <5.12.0` (`@redis/client` v5; >=5.12.0 has its own
  // `node-redis:*` diagnostics_channel, see `redis-dc-subscriber.ts`). Friendly
  // commands route through the public `sendCommand`, so it covers them all — no
  // `executor` entry (would double-count).
  {
    channelName: 'command',
    module: { name: '@redis/client', versionRange: '>=5.0.0 <5.12.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: 'sendCommand', kind: 'Async' },
  },
  {
    channelName: 'connect',
    module: { name: '@redis/client', versionRange: '>=5.0.0 <5.12.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: 'connect', kind: 'Async' },
  },
  // Batch (multi/pipeline) — one span per `exec`. Batched commands bypass `sendCommand`,
  // so they go through the client's batch executors, which receive the queued commands
  // array (→ batch size). v5 splits MULTI/PIPELINE into two methods; v4's single
  // `multiExecutor` is MULTI when a `chainId` arg is present, PIPELINE otherwise.
  {
    channelName: 'multi',
    module: { name: '@redis/client', versionRange: '>=5.0.0 <5.12.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: '_executeMulti', kind: 'Async' },
  },
  {
    channelName: 'pipeline',
    module: { name: '@redis/client', versionRange: '>=5.0.0 <5.12.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: '_executePipeline', kind: 'Async' },
  },
  {
    channelName: 'batch',
    module: { name: '@redis/client', versionRange: '^1.0.0', filePath: 'dist/lib/client/index.js' },
    functionQuery: { className: 'RedisClient', methodName: 'multiExecutor', kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const redisModuleNames = getModuleNames(redisConfig);

export const redisChannels = {
  REDIS_COMMAND: 'orchestrion:redis:command',
  NODE_REDIS_COMMAND: 'orchestrion:@redis/client:command',
  NODE_REDIS_EXECUTOR: 'orchestrion:@redis/client:executor',
  NODE_REDIS_CONNECT: 'orchestrion:@redis/client:connect',
  NODE_REDIS_MULTI: 'orchestrion:@redis/client:multi',
  NODE_REDIS_PIPELINE: 'orchestrion:@redis/client:pipeline',
  NODE_REDIS_BATCH: 'orchestrion:@redis/client:batch',
} as const;
