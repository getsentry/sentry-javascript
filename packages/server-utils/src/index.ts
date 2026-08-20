export * from './exports';

// Exports using diagnostics channels
export { bindTracingChannelToSpan } from './tracing-channel';
export type { TracingChannelPayloadWithSpan } from './tracing-channel';
export type { InstrumentationConfig } from './orchestrion';
export {
  fastifyIntegration,
  // oxlint-disable-next-line typescript/no-deprecated
  handleFastifyError,
  // oxlint-disable-next-line typescript/no-deprecated
  instrumentFastify,
} from './integrations/fastify';

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
