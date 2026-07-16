import type { InstrumentationConfig } from '..';

export const ioredisConfig = [
  // ioredis `<5.11.0` (>=5.11.0 publishes its own `ioredis:*` diagnostics_channel)
  ...['lib/redis.js', 'built/redis.js', 'built/redis/index.js'].flatMap((filePath): InstrumentationConfig[] => [
    {
      channelName: 'command',
      module: { name: 'ioredis', versionRange: '>=2.0.0 <5.0.0', filePath },
      functionQuery: { expressionName: 'sendCommand', kind: 'Async' },
    },
    {
      channelName: 'connect',
      module: { name: 'ioredis', versionRange: '>=2.0.0 <5.0.0', filePath },
      functionQuery: { expressionName: 'connect', kind: 'Async' },
    },
  ]),
  {
    channelName: 'command',
    module: { name: 'ioredis', versionRange: '>=5.0.0 <5.11.0', filePath: 'built/Redis.js' },
    functionQuery: { className: 'Redis', methodName: 'sendCommand', kind: 'Async' },
  },
  {
    channelName: 'connect',
    module: { name: 'ioredis', versionRange: '>=5.0.0 <5.11.0', filePath: 'built/Redis.js' },
    functionQuery: { className: 'Redis', methodName: 'connect', kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const ioredisChannels = {
  IOREDIS_COMMAND: 'orchestrion:ioredis:command',
  IOREDIS_CONNECT: 'orchestrion:ioredis:connect',
} as const;
