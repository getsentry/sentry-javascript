/**
 * Server-only utilities shared across Sentry server SDKs.
 *
 * @module
 */

export { mongooseIntegration } from './mongoose';
export { redisIntegration, type RedisDiagnosticChannelsOptions } from './redis';
export type { RedisDiagnosticChannelResponseHook } from './redis/redis-dc-subscriber';
export { defaultDbStatementSerializer } from './redis/redis-statement-serializer';
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
