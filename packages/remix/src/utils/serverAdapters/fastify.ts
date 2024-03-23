import { SupportedFramework, prepareWrapCreateRequestHandler } from './shared';

export const wrapFastifyCreateRequestHandler = prepareWrapCreateRequestHandler(SupportedFramework.Fastify);
