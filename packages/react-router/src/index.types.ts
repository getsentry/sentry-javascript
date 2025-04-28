/* eslint-disable import/export */

import type { Integration, Options, StackParser } from '@sentry/core';
import type * as clientSdk from './client';
import type * as serverSdk from './server';

// re-define colliding type exports below
export * from './client';
export * from './server';
export * from './vite';

/** Initializes Sentry React Router SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): void;

export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;
export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const defaultStackParser: StackParser;
export declare const getDefaultIntegrations: (options: Options) => Integration[];

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;
