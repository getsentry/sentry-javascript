/* eslint-disable import/export */

// We export everything from both the client part of the SDK and from the server part. Some of the exports collide,
// which is not allowed, unless we redifine the colliding exports in this file - which we do below.
export * from './index.client';
export * from './index.server';

import type { Integration, StackParser } from '@sentry/types';

import * as clientSdk from './index.client';
import * as serverSdk from './index.server';
import type { RemixOptions } from './utils/remixOptions';

/** Initializes Sentry Remix SDK */
export declare function init(options: RemixOptions): void;

// We export a merged Integrations object so that users can (at least typing-wise) use all integrations everywhere.
export const Integrations = { ...clientSdk.Integrations, ...serverSdk.Integrations };

export declare const defaultIntegrations: Integration[];
export declare const defaultStackParser: StackParser;
