export { applyAggregateErrorsToEvent } from './aggregate-errors';
export { getBreadcrumbLogLevelFromHttpStatusCode } from './breadcrumb-log-level';
export {
  getComponentName,
  getLocationHref,
  htmlTreeAsString,
} from './browser';
export { dsnFromString, dsnToString, makeDsn } from './dsn';
export { SentryError } from './error';
export { GLOBAL_OBJ } from './worldwide';
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
export type { Logger } from './logger';

export {
  addContextToFrame,
  addExceptionMechanism,
  addExceptionTypeValue,
  checkOrSetAlreadyCaught,
  getEventDescription,
  parseSemver,
  uuid4,
} from './misc';
export { isNodeEnv, loadModule } from './node';
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
} from './object';
export { basename, dirname, isAbsolute, join, normalizePath, relative, resolve } from './path';
export { makePromiseBuffer } from './promisebuffer';
export type { PromiseBuffer } from './promisebuffer';

export { severityLevelFromString } from './severity';
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
  supportsHistory,
  supportsNativeFetch,
  supportsReferrerPolicy,
  supportsReportingObserver,
} from './supports';
export { SyncPromise, rejectedSyncPromise, resolvedSyncPromise } from './syncpromise';
export {
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
  MAX_BAGGAGE_STRING_LENGTH,
  SENTRY_BAGGAGE_KEY_PREFIX,
  SENTRY_BAGGAGE_KEY_PREFIX_REGEX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  parseBaggageHeader,
  objectToBaggageHeader,
} from './baggage';

export { getSanitizedUrlString, parseUrl, stripUrlQueryAndFragment } from './url';
export { eventFromMessage, eventFromUnknownInput, exceptionFromError, parseStackFrames } from './eventbuilder';
export { callFrameToStackFrame, watchdogTimer } from './anr';
export { LRUMap } from './lru';
export {
  generateTraceId,
  generateSpanId,
} from './propagationContext';
export { vercelWaitUntil } from './vercelWaitUntil';
export { SDK_VERSION } from './version';
export { getDebugImagesForResources, getFilenameToDebugIdMap } from './debug-ids';
export { escapeStringForRegex } from './vendor/escapeStringForRegex';
