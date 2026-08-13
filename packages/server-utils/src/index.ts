export * from './exports';

// Exports using diagnostics channels
export { instrumentPrisma, prismaIntegration } from './prisma';
export type { PrismaInstrumentationConfig, PrismaOptions } from './prisma';
export { bindTracingChannelToSpan } from './tracing-channel';
export type {
  SentryTracingChannel,
  TracingChannelLifeCycleOptions,
  TracingChannelBindingHandle,
  TracingChannelPayloadWithSpan,
} from './tracing-channel';
export type { InstrumentationConfig } from './orchestrion';
export type { GenAiOptions } from './ai/core/utils';
export { vercelAIIntegration, type VercelAiOptions } from './vercel-ai';
export {
  fastifyIntegration,
  // oxlint-disable-next-line typescript/no-deprecated
  handleFastifyError,
  // oxlint-disable-next-line typescript/no-deprecated
  instrumentFastify,
} from './integrations/fastify';
