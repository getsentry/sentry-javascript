// hoist core
export { applyAggregateErrorsToEvent } from './aggregate-errors';
export { getBreadcrumbLogLevelFromHttpStatusCode } from './breadcrumb-log-level';
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
export {
  addContextToFrame,
  addExceptionMechanism,
  addExceptionTypeValue,
  checkOrSetAlreadyCaught,
  getEventDescription,
  parseSemver,
  uuid4,
} from './misc';
export { normalize, normalizeToSize } from './normalize';
export {
  addNonEnumerableProperty,
  convertToPlainObject,
  dropUndefinedKeys,
  extractExceptionKeysForMessage,
  fill,
  getOriginalFunction,
  markFunctionWrapped,
  objectify,
} from './object';
export { makePromiseBuffer } from './promisebuffer';
export type { PromiseBuffer } from './promisebuffer';
export {
  addNormalizedRequestDataToEvent,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
} from './requestdata';
export type { AddRequestDataToEventOptions } from './requestdata';
export { severityLevelFromString, validSeverityLevels } from './severity';
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
export { SyncPromise, rejectedSyncPromise, resolvedSyncPromise } from './syncpromise';
export {
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
  MAX_BAGGAGE_STRING_LENGTH,
  SENTRY_BAGGAGE_KEY_PREFIX,
  SENTRY_BAGGAGE_KEY_PREFIX_REGEX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  parseBaggageHeader,
} from './baggage';
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
export { eventFromMessage, eventFromUnknownInput, exceptionFromError, parseStackFrames } from './eventbuilder';
export { callFrameToStackFrame, watchdogTimer } from './anr';
export { LRUMap } from './lru';
export { generatePropagationContext } from './propagationContext';
export { vercelWaitUntil } from './vercelWaitUntil';
export { SDK_VERSION } from './version';
export { getDebugImagesForResources, getFilenameToDebugIdMap } from './debug-ids';
export { escapeStringForRegex } from './vendor/escapeStringForRegex';

// hoist browser
export { getComponentName, getDomElement, getLocationHref, htmlTreeAsString } from './browser';
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
export {
  _browserPerformanceTimeOriginMode,
  browserPerformanceTimeOrigin,
} from './time';
export { supportsHistory } from './vendor/supportsHistory';

// hoist node
export { dynamicRequire, isNodeEnv, loadModule } from './node';

//  ----- TO BE FULLY DEPRECATED -----
export { flatten } from './array';
export { memoBuilder } from './memo';
export { arrayify } from './misc';
export { normalizeUrlToBase } from './normalize';
export { urlEncode } from './object';
export { basename, dirname, isAbsolute, join, normalizePath, relative, resolve } from './path';
export {
  // eslint-disable-next-line deprecation/deprecation
  extractPathForTransaction,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  addRequestDataToEvent,
} from './requestdata';
export type {
  // eslint-disable-next-line deprecation/deprecation
  TransactionNamingScheme,
} from './requestdata';
export { _asyncNullishCoalesce } from './buildPolyfills/_asyncNullishCoalesce';
export { _asyncOptionalChain } from './buildPolyfills/_asyncOptionalChain';
export { _asyncOptionalChainDelete } from './buildPolyfills/_asyncOptionalChainDelete';
export { _nullishCoalesce } from './buildPolyfills/_nullishCoalesce';
export { _optionalChain } from './buildPolyfills/_optionalChain';
export { _optionalChainDelete } from './buildPolyfills/_optionalChainDelete';
export { BAGGAGE_HEADER_NAME } from './baggage';
export { getNumberOfUrlSegments, getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from './url';
export { makeFifoCache } from './cache';
