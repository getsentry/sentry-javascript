import type {
  RequestInstrumentationOptions as RequestInstrumentationOptionsT,
  SpanStatusType as SpanStatusTypeT,
} from '@sentry-internal/tracing';
import {
  Apollo,
  BROWSER_TRACING_INTEGRATION_ID as BROWSER_TRACING_INTEGRATION_ID_T,
  BrowserTracing as BrowserTracingT,
  Express,
  GraphQL,
  IdleTransaction as IdleTransactionT,
  Mongo,
  Mysql,
  Postgres,
  Prisma,
  Span as SpanT,
  SpanStatus as SpanStatusT,
  TRACEPARENT_REGEXP as TRACEPARENT_REGEXP_T,
  Transaction as TransactionT,
  addExtensionMethods as addExtensionMethodsT,
  defaultRequestInstrumentationOptions as defaultRequestInstrumentationOptionsT,
  extractTraceparentData as extractTraceparentDataT,
  getActiveTransaction as getActiveTransactionT,
  hasTracingEnabled as hasTracingEnabledT,
  instrumentOutgoingRequests as instrumentOutgoingRequestsT,
  spanStatusfromHttpCode as spanStatusfromHttpCodeT,
  startIdleTransaction as startIdleTransactionT,
  stripUrlQueryAndFragment as stripUrlQueryAndFragmentT,
} from '@sentry-internal/tracing';

// BrowserTracing is already exported as part of `Integrations` below (and for the moment will remain so for
// backwards compatibility), but that interferes with treeshaking, so we also export it separately
// here.
/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 * `BrowserTracing` can be imported from `@sentry/browser` or your framework SDK
 *
 * import { BrowserTracing } from '@sentry/browser';
 * new BrowserTracing()
 */
// eslint-disable-next-line deprecation/deprecation
export const BrowserTracing = BrowserTracingT;

// BrowserTracing is already exported as part of `Integrations` below (and for the moment will remain so for
// backwards compatibility), but that interferes with treeshaking, so we also export it separately
// here.
/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 * `BrowserTracing` can be imported from `@sentry/browser` or your framework SDK
 *
 * import { BrowserTracing } from '@sentry/browser';
 * new BrowserTracing()
 */
// eslint-disable-next-line deprecation/deprecation
export type BrowserTracing = BrowserTracingT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export const addExtensionMethods = addExtensionMethodsT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `getActiveTransaction` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
// eslint-disable-next-line deprecation/deprecation
export const getActiveTransaction = getActiveTransactionT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `extractTraceparentData` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
// eslint-disable-next-line deprecation/deprecation
export const extractTraceparentData = extractTraceparentDataT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `spanStatusfromHttpCode` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
// eslint-disable-next-line deprecation/deprecation
export const spanStatusfromHttpCode = spanStatusfromHttpCodeT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `SpanStatusType` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
export type SpanStatusType = SpanStatusTypeT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `Transaction` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
export const Transaction = TransactionT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `Transaction` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
export type Transaction = TransactionT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `Span` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
export const Span = SpanT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `Span` can be imported from `@sentry/node`, `@sentry/browser`, or your framework SDK
 */
export type Span = SpanT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export const BROWSER_TRACING_INTEGRATION_ID = BROWSER_TRACING_INTEGRATION_ID_T;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `defaultRequestInstrumentationOptions` can be imported from `@sentry/browser`, or your framework SDK
 */
export const defaultRequestInstrumentationOptions = defaultRequestInstrumentationOptionsT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `hasTracingEnabled` can be imported from `@sentry/utils`
 */
export const hasTracingEnabled = hasTracingEnabledT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `stripUrlQueryAndFragment` can be imported from `@sentry/utils`
 */
export const stripUrlQueryAndFragment = stripUrlQueryAndFragmentT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 *
 * `TRACEPARENT_REGEXP` can be imported from `@sentry/utils`
 */
export const TRACEPARENT_REGEXP = TRACEPARENT_REGEXP_T;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export const IdleTransaction = IdleTransactionT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export type IdleTransaction = IdleTransactionT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export const instrumentOutgoingRequests = instrumentOutgoingRequestsT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export const startIdleTransaction = startIdleTransactionT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
// eslint-disable-next-line deprecation/deprecation
export const SpanStatus = SpanStatusT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
// eslint-disable-next-line deprecation/deprecation
export type SpanStatus = SpanStatusT;

/**
 * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
 */
export type RequestInstrumentationOptions = RequestInstrumentationOptionsT;

export const Integrations = {
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `BrowserTracing` can be imported from `@sentry/browser` or your framework SDK
   *
   * import { BrowserTracing } from '@sentry/browser';
   * new BrowserTracing()
   */
  // eslint-disable-next-line deprecation/deprecation
  BrowserTracing: BrowserTracing,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `Apollo` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.Apollo({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  Apollo: Apollo,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `Express` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.Express({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  Express: Express,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `GraphQL` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.GraphQL({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  GraphQL: GraphQL,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `Mongo` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.Mongo({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  Mongo: Mongo,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `Mysql` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.Mysql({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  Mysql: Mysql,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `Postgres` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.Postgres({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  Postgres: Postgres,
  /**
   * @deprecated `@sentry/tracing` has been deprecated and will be moved to to `@sentry/node`, `@sentry/browser`, or your framework SDK in the next major version.
   * `Prisma` can be imported from `@sentry/node`
   *
   * import { Integrations } from '@sentry/node';
   * new Integrations.Prisma({ ... })
   */
  // eslint-disable-next-line deprecation/deprecation
  Prisma: Prisma,
};

// Treeshakable guard to remove all code related to tracing
declare const __SENTRY_TRACING__: boolean;

// Guard for tree
if (typeof __SENTRY_TRACING__ === 'undefined' || __SENTRY_TRACING__) {
  // We are patching the global object with our hub extension methods
  addExtensionMethodsT();
}
