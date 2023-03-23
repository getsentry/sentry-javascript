/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part.
// Some of the exports collide, which is not allowed, unless we redifine the colliding
// exports in this file - which we do below.
export * from './client';
export * from './config';
export * from './server';

import type { Integration, Options, StackParser } from '@sentry/types';
// eslint-disable-next-line import/no-unresolved
import type { HandleClientError, HandleServerError, ServerLoad } from '@sveltejs/kit';

import type * as clientSdk from './client';
import type * as serverSdk from './server';

/** Initializes Sentry SvelteKit SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): void;

export declare function handleErrorWithSentry<T extends HandleClientError | HandleServerError>(
  handleError?: T,
): ReturnType<T>;

export declare function wrapLoadWithSentry<S extends ServerLoad>(origLoad: S): S;

// We export a merged Integrations object so that users can (at least typing-wise) use all integrations everywhere.
export declare const Integrations: typeof clientSdk.Integrations & typeof serverSdk.Integrations;

export declare const defaultIntegrations: Integration[];
export declare const defaultStackParser: StackParser;

export declare function close(timeout?: number | undefined): PromiseLike<boolean>;
export declare function flush(timeout?: number | undefined): PromiseLike<boolean>;
export declare function lastEventId(): string | undefined;
