// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redefine the colliding
// exports in this file - which we do below.
export * from './index.client';
export * from './index.server';

import type { Integration, Options, StackParser } from '@sentry/types';

import type * as clientSdk from './index.client';
import type * as serverSdk from './index.server';
import sentryAstro from './index.server';

/** Initializes Sentry Astro SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): void;

// We only export server Integrations for now, until the exports are removed from Svelte and Node SDKs.
// Necessary to avoid type collision.
export declare const Integrations: typeof serverSdk.Integrations;

export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;

export declare const defaultIntegrations: Integration[];
export declare const getDefaultIntegrations: (options: Options) => Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;

export default sentryAstro;
