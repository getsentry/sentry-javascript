export * from './exports';

// Exports using diagnostics channels
export { prismaIntegration } from './prisma';
export { bindTracingChannelToSpan } from './tracing-channel';
export type { TracingChannelPayloadWithSpan } from './tracing-channel';
export type { InstrumentationConfig } from './orchestrion';
export type { GenAiOptions } from './ai/core/utils';
export { vercelAIIntegration } from './vercel-ai';
export {
  fastifyIntegration,
  // oxlint-disable-next-line typescript/no-deprecated
  handleFastifyError,
  // oxlint-disable-next-line typescript/no-deprecated
  instrumentFastify,
} from './integrations/fastify';
