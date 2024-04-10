import { SupportedFramework, prepareWrapCreateRequestHandler } from './shared';

/**
 * Instruments `createRequestHandler` from `@mcansh/remix-fastify`
 */
export const wrapFastifyCreateRequestHandler = prepareWrapCreateRequestHandler(SupportedFramework.Fastify);
