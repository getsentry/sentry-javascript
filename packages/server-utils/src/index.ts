/**
 * Server-only utilities shared across Sentry server SDKs.
 *
 * @module
 */

export { mysql2Integration } from './mysql2';
export {
  IOREDIS_DC_CHANNEL_COMMAND,
  IOREDIS_DC_CHANNEL_CONNECT,
  REDIS_DC_CHANNEL_BATCH,
  REDIS_DC_CHANNEL_COMMAND,
  REDIS_DC_CHANNEL_CONNECT,
  subscribeRedisDiagnosticChannels,
} from './redis/redis-dc-subscriber';
export type {
  IORedisCommandData,
  RedisBatchData,
  RedisCommandData,
  RedisConnectData,
  RedisDiagnosticChannelResponseHook,
  RedisTracingChannelFactory,
} from './redis/redis-dc-subscriber';
export { bindTracingChannelToSpan } from './tracing-channel';
export type {
  SentryTracingChannel,
  TracingChannelLifeCycleOptions,
  TracingChannelBindingHandle,
  TracingChannelPayloadWithSpan,
} from './tracing-channel';
export { vercelAiIntegration } from './vercel-ai';

export {
  fastifyIntegration,
  // oxlint-disable-next-line typescript/no-deprecated
  handleFastifyError,
  // oxlint-disable-next-line typescript/no-deprecated
  instrumentFastify,
} from './integrations/tracing-channel/fastify';
