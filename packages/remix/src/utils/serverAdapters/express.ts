import { type ExpressCreateHandlerWrapper } from '../vendor/types';
import { SupportedFramework, prepareWrapCreateRequestHandler } from './shared';

/**
 * Instruments `createRequestHandler` from `@remix-run/express`
 */
export const wrapExpressCreateRequestHandler = prepareWrapCreateRequestHandler(SupportedFramework.Express) as ExpressCreateHandlerWrapper;
