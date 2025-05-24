/* eslint-disable import/export */

import type { Client, Integration, Options, StackParser } from '@sentry/core';
import type { SentryNuxtClientOptions, SentryNuxtServerOptions } from './common/types';
import type * as clientSdk from './index.client';
import type * as serverSdk from './index.server';

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we re-export the colliding exports in this file - which we do below.
export * from './index.client';
export * from './index.server';

// re-export colliding types
export declare function init(options: Options | SentryNuxtClientOptions | SentryNuxtServerOptions): Client | undefined;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;
export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;
