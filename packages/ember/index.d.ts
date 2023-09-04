import type Route from '@ember/routing/route';
import type { BrowserOptions } from '@sentry/browser';
import type { Transaction } from '@sentry/types';
export declare function InitSentryForEmber(_runtimeConfig?: BrowserOptions): void;
export declare const getActiveTransaction: () => Transaction | undefined;
type RouteConstructor = new (...args: ConstructorParameters<typeof Route>) => Route;
export declare const instrumentRoutePerformance: <T extends RouteConstructor>(BaseRoute: T) => T;
export * from '@sentry/browser';
export declare const init: typeof InitSentryForEmber;
