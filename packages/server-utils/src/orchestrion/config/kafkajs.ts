import type { InstrumentationConfig } from '..';
import { getModuleNames } from './module-names';

export const kafkajsConfig = [
  {
    channelName: 'send_batch',
    module: { name: 'kafkajs', versionRange: '>=2.0.0 <3', filePath: 'src/producer/messageProducer.js' },
    // `const sendBatch = async (...) => {...}` — `expressionName` matches the `const` assignment.
    // We instrument ONLY `sendBatch`: `send` funnels into it internally, so `producer.send`,
    // `producer.sendBatch` and their transactional variants all flow through this one channel.
    // Instrumenting `send` too would double-count spans.
    functionQuery: { expressionName: 'sendBatch', kind: 'Async' },
  },
  {
    channelName: 'consumer_run',
    module: { name: 'kafkajs', versionRange: '>=2.0.0 <3', filePath: 'src/consumer/index.js' },
    // `const run = async (config) => {...}` — matched by `expressionName`. We don't span `run` itself:
    // the `start` subscriber swaps `config.eachMessage`/`eachBatch` (on `ctx.arguments[0]`) for
    // span-creating wrappers before the original runs. This works because the transform re-reads
    // `ctx.arguments` when invoking the original.
    functionQuery: { expressionName: 'run', kind: 'Async' },
  },
] satisfies InstrumentationConfig[];

export const kafkajsModuleNames = getModuleNames(kafkajsConfig);

export const kafkajsChannels = {
  KAFKAJS_SEND_BATCH: 'orchestrion:kafkajs:send_batch',
  KAFKAJS_CONSUMER_RUN: 'orchestrion:kafkajs:consumer_run',
} as const;
