/* eslint-disable import/export */

export * from './config';
export * from './client';
export * from './server';

import type { Integration, Options, StackParser } from '@sentry/types';

import type { BrowserOptions } from './client';
import * as clientSdk from './client';
import type { NodeOptions } from './server';
import * as serverSdk from './server';

export declare function init(options: Options | BrowserOptions | NodeOptions): void;

export const Integrations = { ...clientSdk.Integrations, ...serverSdk.Integrations };

export declare const defaultIntegrations: Integration[];
export declare const defaultStackParser: StackParser;

declare const runtime: 'client' | 'server';

export const close = runtime === 'client' ? clientSdk.close : serverSdk.close;
export const flush = runtime === 'client' ? clientSdk.flush : serverSdk.flush;
export const lastEventId = runtime === 'client' ? clientSdk.lastEventId : serverSdk.lastEventId;
