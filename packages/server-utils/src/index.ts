export * from './exports';

// Exports using diagnostics channels
export { detectOrchestrionSetup } from './orchestrion/detect';
// oxlint-disable-next-line typescript/no-deprecated -- re-exported so the deprecated `setupKoaErrorHandler` can delegate
export { attachKoaErrorHandler } from './integrations/koa/koa-error-handler';
import { attachHapiErrorHandler as _attachHapiErrorHandler } from './integrations/hapi/hapi-error-handler';
export { bindTracingChannelToSpan } from './tracing-channel';
export type { TracingChannelPayloadWithSpan } from './tracing-channel';
export type { InstrumentationConfig } from './orchestrion/apmTypes';
// Runtime target of the bundler-injected module snippet. The snippet imports it
// from this entry alongside the module's subscriber factory (see
// `orchestrion/bundler/moduleInjectedTransform.ts`); it is a plain runtime
// helper with no orchestrion build-time dependency.
export { orchestrionModuleInjected } from './utils/moduleInjected';
export {
  fastifyIntegration,
  // oxlint-disable-next-line typescript/no-deprecated
  handleFastifyError,
  // oxlint-disable-next-line typescript/no-deprecated
  instrumentFastify,
} from './integrations/fastify';

/**
 * @deprecated This is a temporary export to avoid breaking changes. It will be removed in the next major version.
 */
export const attachHapiErrorHandler = _attachHapiErrorHandler;

// Integrations
export { prismaIntegration } from './integrations/prisma';
export { amqplibIntegration } from './integrations/amqplib';
export { anthropicAIIntegration } from './integrations/anthropic';
export { awsIntegration } from './integrations/aws-sdk';
export { dataloaderIntegration } from './integrations/dataloader';
export { genericPoolIntegration } from './integrations/generic-pool';
export { googleGenAIIntegration } from './integrations/google-genai';
export { graphqlIntegration } from './integrations/graphql';
export { hapiIntegration } from './integrations/hapi';
export { koaIntegration } from './integrations/koa';
export { redisIntegration } from './integrations/redis';
export { kafkaIntegration } from './integrations/kafkajs';
export { knexIntegration } from './integrations/knex';
export { langChainIntegration } from './integrations/langchain';
export { langGraphIntegration } from './integrations/langgraph';
export { lruMemoizerIntegration } from './integrations/lru-memoizer';
export { mongoIntegration } from './integrations/mongodb';
export { mongooseIntegration } from './integrations/mongoose';
export { mysqlIntegration } from './integrations/mysql';
export { mysql2Integration } from './integrations/mysql2';
export { openAIIntegration } from './integrations/openai';
export { postgresIntegration } from './integrations/postgres';
export { postgresJsIntegration } from './integrations/postgres-js';
export { tediousIntegration } from './integrations/tedious';
export { vercelAIIntegration } from './integrations/vercel-ai';
export { expressIntegration } from './integrations/express';
export { firebaseIntegration } from './integrations/firebase';

export { getTracingIntegrations, getErrorIntegrations } from './integrations';
