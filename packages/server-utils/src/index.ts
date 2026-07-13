/**
 * Server-only utilities shared across Sentry server SDKs.
 *
 * @module
 */

export { graphqlIntegration } from './graphql';
export {
  getV3CommandOperation,
  getV3SpanAttributes,
  getV4SpanAttributes,
  startMongoSpan,
} from './mongodb/mongodb-span';
export type { MongodbNamespace, MongoV3Topology } from './mongodb/mongodb-span';
export { mongooseIntegration } from './mongoose';
export { mysql2Integration } from './mysql2';
export { instrumentPrisma, prismaIntegration } from './prisma';
export type { PrismaInstrumentationConfig, PrismaOptions } from './prisma';
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
