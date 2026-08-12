export * from './exports';

// Exports using diagnostics channels
export { graphqlIntegration } from './graphql';
export { mongooseIntegration, startMongooseLegacySpan } from './mongoose';
export type { MongooseLegacyCollection, StartMongooseLegacySpanOptions } from './mongoose';
export {
  getV3CommandOperation,
  getV3SpanAttributes,
  getV4SpanAttributes,
  startMongoSpan,
} from './mongodb/mongodb-span';
export type { MongodbNamespace, MongoV3Topology } from './mongodb/mongodb-span';
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
export type { InstrumentationConfig } from './orchestrion';
export type { GenAiOptions } from './ai/core/utils';
export { vercelAiIntegration, type VercelAiOptions } from './vercel-ai';
export {
  fastifyIntegration,
  // oxlint-disable-next-line typescript/no-deprecated
  handleFastifyError,
  // oxlint-disable-next-line typescript/no-deprecated
  instrumentFastify,
} from './integrations/tracing-channel/fastify';
export type { AsyncLocalStorageLookup } from './types';
