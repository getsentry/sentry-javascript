// import/export got a false positive, and affects most of our index barrel files
// can be removed once following issue is fixed: https://github.com/import-js/eslint-plugin-import/issues/703
/* eslint-disable import/export */

import type { Integration, Options, StackParser } from '@sentry/core';
import type * as clientSdk from './client';
import type * as serverSdk from './server';

// re-define colliding type exports below
export * from './client';
export * from './server';

/** Initializes Sentry React Router SDK */
export declare function init(options: Options | clientSdk.BrowserOptions | serverSdk.NodeOptions): void;

export declare const contextLinesIntegration: typeof clientSdk.contextLinesIntegration;
export declare const linkedErrorsIntegration: typeof clientSdk.linkedErrorsIntegration;
export declare const spanStreamingIntegration: typeof clientSdk.spanStreamingIntegration;
// The client entry serves the `@sentry/core/browser` span-start APIs, which install span streaming
// on first use; the server entry serves the plain `@sentry/core` ones. Same signatures, but the
// star exports above are ambiguous without these.
export declare const startSpan: typeof clientSdk.startSpan;
export declare const startSpanManual: typeof clientSdk.startSpanManual;
export declare const startInactiveSpan: typeof clientSdk.startInactiveSpan;
export declare const withStaticSpan: typeof clientSdk.withStaticSpan;
// oxlint-disable-next-line typescript/no-deprecated
export declare const withStreamedSpan: typeof clientSdk.withStreamedSpan;
export declare const defaultStackParser: StackParser;
export declare const getDefaultIntegrations: (options: Options) => Integration[];

export declare const logger: typeof clientSdk.logger | typeof serverSdk.logger;

export declare const growthbookIntegration: typeof clientSdk.growthbookIntegration;
export declare const launchDarklyIntegration: typeof clientSdk.launchDarklyIntegration;
export declare const buildLaunchDarklyFlagUsedHandler: typeof clientSdk.buildLaunchDarklyFlagUsedHandler;
export declare const openFeatureIntegration: typeof clientSdk.openFeatureIntegration;
export declare const OpenFeatureIntegrationHook: typeof clientSdk.OpenFeatureIntegrationHook;
export declare const statsigIntegration: typeof clientSdk.statsigIntegration;
export declare const unleashIntegration: typeof clientSdk.unleashIntegration;
