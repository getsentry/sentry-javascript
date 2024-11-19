export { applyAggregateErrorsToEvent } from './aggregate-errors';
// eslint-disable-next-line deprecation/deprecation
export { flatten } from './array';
export { getBreadcrumbLogLevelFromHttpStatusCode } from './breadcrumb-log-level';
export { getComponentName, getDomElement, getLocationHref, htmlTreeAsString } from './browser';
export { dsnFromString, dsnToString, makeDsn } from './dsn';
export { SentryError } from './error';
export { GLOBAL_OBJ, getGlobalSingleton } from './worldwide';
export type { InternalGlobal } from './worldwide';
export { addConsoleInstrumentationHandler } from './instrument/console';
export { addFetchEndInstrumentationHandler, addFetchInstrumentationHandler } from './instrument/fetch';
export { addGlobalErrorInstrumentationHandler } from './instrument/globalError';
export { addGlobalUnhandledRejectionInstrumentationHandler } from './instrument/globalUnhandledRejection';
export {
  addHandler,
  maybeInstrument,
  resetInstrumentationHandlers,
  triggerHandlers,
} from './instrument/handlers';
export {
  isDOMError,
  isDOMException,
  isElement,
  isError,
  isErrorEvent,
  isEvent,
  isInstanceOf,
  isParameterizedString,
  isPlainObject,
  isPrimitive,
  isRegExp,
  isString,
  isSyntheticEvent,
  isThenable,
  isVueViewModel,
} from './is';
export { isBrowser } from './isBrowser';
export { CONSOLE_LEVELS, consoleSandbox, logger, originalConsoleMethods } from './logger';
export { memoBuilder } from './memo';
export {
  addContextToFrame,
  addExceptionMechanism,
  addExceptionTypeValue,
  // eslint-disable-next-line deprecation/deprecation
  arrayify,
  checkOrSetAlreadyCaught,
  getEventDescription,
  parseSemver,
  uuid4,
} from './misc';
export { dynamicRequire, isNodeEnv, loadModule } from './node';
export { normalize, normalizeToSize, normalizeUrlToBase } from './normalize';
export {
  addNonEnumerableProperty,
  convertToPlainObject,
  dropUndefinedKeys,
  extractExceptionKeysForMessage,
  fill,
  getOriginalFunction,
  markFunctionWrapped,
  objectify,
  urlEncode,
} from './object';
export { basename, dirname, isAbsolute, join, normalizePath, relative, resolve } from './path';
export { makePromiseBuffer } from './promisebuffer';
export type { PromiseBuffer } from './promisebuffer';

// TODO: Remove requestdata export once equivalent integration is used everywhere
export {
  DEFAULT_USER_INCLUDES,
  addNormalizedRequestDataToEvent,
  addRequestDataToEvent,
  // eslint-disable-next-line deprecation/deprecation
  extractPathForTransaction,
  extractRequestData,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
} from './requestdata';

export type {
  AddRequestDataToEventOptions,
  // eslint-disable-next-line deprecation/deprecation
  TransactionNamingScheme,
} from './requestdata';

export {
  severityLevelFromString,
  // TODO(v9): Don't export
  validSeverityLevels,
} from './severity';

export {
  UNKNOWN_FUNCTION,
  createStackParser,
  getFramesFromEvent,
  getFunctionName,
  stackParserFromStackParserOptions,
  stripSentryFramesAndReverse,
} from './stacktrace';
export { filenameIsInApp, node, nodeStackLineParser } from './node-stack-trace';
export { isMatchingPattern, safeJoin, snipLine, stringMatchesSomePattern, truncate } from './string';
export {
  isNativeFunction,
  supportsDOMError,
  supportsDOMException,
  supportsErrorEvent,
  supportsFetch,
  supportsNativeFetch,
  supportsReferrerPolicy,
  supportsReportingObserver,
} from './supports';
export { SyncPromise, rejectedSyncPromise, resolvedSyncPromise } from './syncpromise';
export {
  // TODO(v9): Don't export
  _browserPerformanceTimeOriginMode,
  browserPerformanceTimeOrigin,
  dateTimestampInSeconds,
  timestampInSeconds,
} from './time';
export {
  TRACEPARENT_REGEXP,
  extractTraceparentData,
  generateSentryTraceHeader,
  propagationContextFromHeaders,
} from './tracing';
export { getSDKSource, isBrowserBundle } from './env';
export type { SdkSource } from './env';
export {
  addItemToEnvelope,
  createAttachmentEnvelopeItem,
  createEnvelope,
  createEventEnvelopeHeaders,
  createSpanEnvelopeItem,
  envelopeContainsItemType,
  envelopeItemTypeToDataCategory,
  forEachEnvelopeItem,
  getSdkMetadataForEnvelopeHeader,
  parseEnvelope,
  serializeEnvelope,
} from './envelope';
export { createClientReportEnvelope } from './clientreport';
export {
  DEFAULT_RETRY_AFTER,
  disabledUntil,
  isRateLimited,
  parseRetryAfterHeader,
  updateRateLimits,
} from './ratelimit';
export type { RateLimits } from './ratelimit';
export {
  // TODO(v9): Don't export
  BAGGAGE_HEADER_NAME,
  // TODO(v9): Don't export
  MAX_BAGGAGE_STRING_LENGTH,
  SENTRY_BAGGAGE_KEY_PREFIX,
  // TODO(v9): Don't export
  SENTRY_BAGGAGE_KEY_PREFIX_REGEX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  parseBaggageHeader,
} from './baggage';

export {
  // TODO(v9): Hoist into RR6
  getNumberOfUrlSegments,
  getSanitizedUrlString,
  // TODO(v9): Remove
  // eslint-disable-next-line deprecation/deprecation
  parseUrl,
  stripUrlQueryAndFragment,
} from './url';

// TODO(v9): Remove
export { makeFifoCache } from './cache';

export { eventFromMessage, eventFromUnknownInput, exceptionFromError, parseStackFrames } from './eventbuilder';

export { callFrameToStackFrame, watchdogTimer } from './anr';

export { LRUMap } from './lru';

export { generatePropagationContext } from './propagationContext';

export { vercelWaitUntil } from './vercelWaitUntil';

export { SDK_VERSION } from './version';

export { getDebugImagesForResources, getFilenameToDebugIdMap } from './debug-ids';

export { escapeStringForRegex } from './vendor/escapeStringForRegex';

// TODO(v9): Hoist this into browser-utils
export { supportsHistory } from './vendor/supportsHistory';

// TODO(v9): Delete these
export { _asyncNullishCoalesce } from './buildPolyfills/_asyncNullishCoalesce';
export { _asyncOptionalChain } from './buildPolyfills/_asyncOptionalChain';
export { _asyncOptionalChainDelete } from './buildPolyfills/_asyncOptionalChainDelete';
export { _nullishCoalesce } from './buildPolyfills/_nullishCoalesce';
export { _optionalChain } from './buildPolyfills/_optionalChain';
export { _optionalChainDelete } from './buildPolyfills/_optionalChainDelete';
