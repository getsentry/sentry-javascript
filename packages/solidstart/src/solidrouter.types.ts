// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.

export * from './client/solidrouter';
export * from './server/solidrouter';

import type * as clientSolidRouter from './client/solidrouter';
import type * as serverSolidRouter from './server/solidrouter';

export declare const solidRouterBrowserTracingIntegration: typeof clientSolidRouter & typeof serverSolidRouter;

export declare const withSentryRouterRouting: typeof clientSolidRouter & typeof serverSolidRouter;
