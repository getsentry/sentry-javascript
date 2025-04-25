/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.

import type { RouterType } from './server/solidrouter';

export * from './client/solidrouter';
export * from './server/solidrouter';

export declare function withSentryRouterRouting(Router: RouterType): RouterType;
