export {
  // BrowserTracing is already exported as part of `Integrations` below (and for the moment will remain so for
  // backwards compatibility), but that interferes with treeshaking, so we also export it separately
  // here.
  BrowserTracing,
  BROWSER_TRACING_INTEGRATION_ID,
  IdleTransaction,
  Span,
  // eslint-disable-next-line deprecation/deprecation
  SpanStatus,
  TRACEPARENT_REGEXP,
  Transaction,
  addExtensionMethods,
  defaultRequestInstrumentationOptions,
  extractTraceparentData,
  instrumentOutgoingRequests,
  getActiveTransaction,
  hasTracingEnabled,
  spanStatusfromHttpCode,
  startIdleTransaction,
  stripUrlQueryAndFragment,
} from '@sentry-internal/tracing';
export type { RequestInstrumentationOptions, SpanStatusType } from '@sentry-internal/tracing';

import {
  addExtensionMethods,
  Apollo,
  BrowserTracing,
  Express,
  GraphQL,
  Mongo,
  Mysql,
  Postgres,
  Prisma,
} from '@sentry-internal/tracing';

export const Integrations = {
  BrowserTracing: BrowserTracing,
  Apollo: Apollo,
  Express: Express,
  GraphQL: GraphQL,
  Mongo: Mongo,
  Mysql: Mysql,
  Postgres: Postgres,
  Prisma: Prisma,
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

// Guard for tree
if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
  // We are patching the global object with our hub extension methods
  addExtensionMethods();
}
