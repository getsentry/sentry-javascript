/**
 * Browser-specific utilities for Sentry SDKs
 *
 * @module
 */

export { startIdleSpan } from './tracing/idleSpan';

export type { XhrBreadcrumbData, XhrBreadcrumbHint } from './types/breadcrumb';
export type { BrowserClientReplayOptions } from './types/browseroptions';
