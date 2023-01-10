/* eslint-disable import/export */

export * from './index.client';
export * from './index.server';

import type { Integration, StackParser } from '@sentry/types';

import * as clientSdk from './index.client';
import * as serverSdk from './index.server';
import { RemixOptions } from './utils/remixOptions';

export declare function init(options: RemixOptions): void;

export const Integrations = { ...clientSdk.Integrations, ...serverSdk.Integrations };

export declare const defaultIntegrations: Integration[];
export declare const defaultStackParser: StackParser;

declare const runtime: 'client' | 'server';

export const close = runtime === 'client' ? clientSdk.close : serverSdk.close;
export const flush = runtime === 'client' ? clientSdk.flush : serverSdk.flush;
export const lastEventId = runtime === 'client' ? clientSdk.lastEventId : serverSdk.lastEventId;
