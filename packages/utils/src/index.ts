/* eslint-disable max-lines */
import {
  CONSOLE_LEVELS as CONSOLE_LEVELS_imported,
  DEFAULT_RETRY_AFTER as DEFAULT_RETRY_AFTER_imported,
  DEFAULT_USER_INCLUDES as DEFAULT_USER_INCLUDES_imported,
  GLOBAL_OBJ as GLOBAL_OBJ_imported,
  LRUMap as LRUMap_imported,
  MAX_BAGGAGE_STRING_LENGTH as MAX_BAGGAGE_STRING_LENGTH_imported,
  SDK_VERSION as SDK_VERSION_imported,
  SENTRY_BAGGAGE_KEY_PREFIX as SENTRY_BAGGAGE_KEY_PREFIX_imported,
  SENTRY_BAGGAGE_KEY_PREFIX_REGEX as SENTRY_BAGGAGE_KEY_PREFIX_REGEX_imported,
  SentryError as SentryError_imported,
  SyncPromise as SyncPromise_imported,
  TRACEPARENT_REGEXP as TRACEPARENT_REGEXP_imported,
  UNKNOWN_FUNCTION as UNKNOWN_FUNCTION_imported,
  _browserPerformanceTimeOriginMode as _browserPerformanceTimeOriginMode_imported,
  addConsoleInstrumentationHandler as addConsoleInstrumentationHandler_imported,
  addContextToFrame as addContextToFrame_imported,
  addExceptionMechanism as addExceptionMechanism_imported,
  addExceptionTypeValue as addExceptionTypeValue_imported,
  addFetchEndInstrumentationHandler as addFetchEndInstrumentationHandler_imported,
  addFetchInstrumentationHandler as addFetchInstrumentationHandler_imported,
  addGlobalErrorInstrumentationHandler as addGlobalErrorInstrumentationHandler_imported,
  addGlobalUnhandledRejectionInstrumentationHandler as addGlobalUnhandledRejectionInstrumentationHandler_imported,
  addHandler as addHandler_imported,
  addItemToEnvelope as addItemToEnvelope_imported,
  addNonEnumerableProperty as addNonEnumerableProperty_imported,
  addNormalizedRequestDataToEvent as addNormalizedRequestDataToEvent_imported,
  addRequestDataToEvent as addRequestDataToEvent_imported,
  applyAggregateErrorsToEvent as applyAggregateErrorsToEvent_imported,
  baggageHeaderToDynamicSamplingContext as baggageHeaderToDynamicSamplingContext_imported,
  basename as basename_imported,
  browserPerformanceTimeOrigin as browserPerformanceTimeOrigin_imported,
  callFrameToStackFrame as callFrameToStackFrame_imported,
  checkOrSetAlreadyCaught as checkOrSetAlreadyCaught_imported,
  consoleSandbox as consoleSandbox_imported,
  convertToPlainObject as convertToPlainObject_imported,
  createAttachmentEnvelopeItem as createAttachmentEnvelopeItem_imported,
  createClientReportEnvelope as createClientReportEnvelope_imported,
  createEnvelope as createEnvelope_imported,
  createEventEnvelopeHeaders as createEventEnvelopeHeaders_imported,
  createSpanEnvelopeItem as createSpanEnvelopeItem_imported,
  createStackParser as createStackParser_imported,
  dateTimestampInSeconds as dateTimestampInSeconds_imported,
  dirname as dirname_imported,
  disabledUntil as disabledUntil_imported,
  dropUndefinedKeys as dropUndefinedKeys_imported,
  dsnFromString as dsnFromString_imported,
  dsnToString as dsnToString_imported,
  dynamicRequire as dynamicRequire_imported,
  dynamicSamplingContextToSentryBaggageHeader as dynamicSamplingContextToSentryBaggageHeader_imported,
  envelopeContainsItemType as envelopeContainsItemType_imported,
  envelopeItemTypeToDataCategory as envelopeItemTypeToDataCategory_imported,
  escapeStringForRegex as escapeStringForRegex_imported,
  eventFromMessage as eventFromMessage_imported,
  eventFromUnknownInput as eventFromUnknownInput_imported,
  exceptionFromError as exceptionFromError_imported,
  extractExceptionKeysForMessage as extractExceptionKeysForMessage_imported,
  extractPathForTransaction as extractPathForTransaction_imported,
  extractRequestData as extractRequestData_imported,
  extractTraceparentData as extractTraceparentData_imported,
  filenameIsInApp as filenameIsInApp_imported,
  fill as fill_imported,
  forEachEnvelopeItem as forEachEnvelopeItem_imported,
  generatePropagationContext as generatePropagationContext_imported,
  generateSentryTraceHeader as generateSentryTraceHeader_imported,
  getBreadcrumbLogLevelFromHttpStatusCode as getBreadcrumbLogLevelFromHttpStatusCode_imported,
  getComponentName as getComponentName_imported,
  getDebugImagesForResources as getDebugImagesForResources_imported,
  getDomElement as getDomElement_imported,
  getEventDescription as getEventDescription_imported,
  getFilenameToDebugIdMap as getFilenameToDebugIdMap_imported,
  getFramesFromEvent as getFramesFromEvent_imported,
  getFunctionName as getFunctionName_imported,
  getGlobalSingleton as getGlobalSingleton_imported,
  getLocationHref as getLocationHref_imported,
  getOriginalFunction as getOriginalFunction_imported,
  getSDKSource as getSDKSource_imported,
  getSanitizedUrlString as getSanitizedUrlString_imported,
  getSdkMetadataForEnvelopeHeader as getSdkMetadataForEnvelopeHeader_imported,
  htmlTreeAsString as htmlTreeAsString_imported,
  isAbsolute as isAbsolute_imported,
  isBrowser as isBrowser_imported,
  isBrowserBundle as isBrowserBundle_imported,
  isDOMError as isDOMError_imported,
  isDOMException as isDOMException_imported,
  isElement as isElement_imported,
  isError as isError_imported,
  isErrorEvent as isErrorEvent_imported,
  isEvent as isEvent_imported,
  isInstanceOf as isInstanceOf_imported,
  isMatchingPattern as isMatchingPattern_imported,
  isNativeFunction as isNativeFunction_imported,
  isNodeEnv as isNodeEnv_imported,
  isParameterizedString as isParameterizedString_imported,
  isPlainObject as isPlainObject_imported,
  isPrimitive as isPrimitive_imported,
  isRateLimited as isRateLimited_imported,
  isRegExp as isRegExp_imported,
  isString as isString_imported,
  isSyntheticEvent as isSyntheticEvent_imported,
  isThenable as isThenable_imported,
  isVueViewModel as isVueViewModel_imported,
  join as join_imported,
  loadModule as loadModule_imported,
  logger as logger_imported,
  makeDsn as makeDsn_imported,
  makeFifoCache as makeFifoCache_imported,
  makePromiseBuffer as makePromiseBuffer_imported,
  markFunctionWrapped as markFunctionWrapped_imported,
  maybeInstrument as maybeInstrument_imported,
  memoBuilder as memoBuilder_imported,
  node as node_imported,
  nodeStackLineParser as nodeStackLineParser_imported,
  normalize as normalize_imported,
  normalizePath as normalizePath_imported,
  normalizeToSize as normalizeToSize_imported,
  normalizeUrlToBase as normalizeUrlToBase_imported,
  objectify as objectify_imported,
  originalConsoleMethods as originalConsoleMethods_imported,
  parseBaggageHeader as parseBaggageHeader_imported,
  parseEnvelope as parseEnvelope_imported,
  parseRetryAfterHeader as parseRetryAfterHeader_imported,
  parseSemver as parseSemver_imported,
  parseStackFrames as parseStackFrames_imported,
  parseUrl as parseUrl_imported,
  propagationContextFromHeaders as propagationContextFromHeaders_imported,
  rejectedSyncPromise as rejectedSyncPromise_imported,
  relative as relative_imported,
  resetInstrumentationHandlers as resetInstrumentationHandlers_imported,
  resolve as resolve_imported,
  resolvedSyncPromise as resolvedSyncPromise_imported,
  safeJoin as safeJoin_imported,
  serializeEnvelope as serializeEnvelope_imported,
  severityLevelFromString as severityLevelFromString_imported,
  snipLine as snipLine_imported,
  stackParserFromStackParserOptions as stackParserFromStackParserOptions_imported,
  stringMatchesSomePattern as stringMatchesSomePattern_imported,
  stripSentryFramesAndReverse as stripSentryFramesAndReverse_imported,
  stripUrlQueryAndFragment as stripUrlQueryAndFragment_imported,
  supportsDOMError as supportsDOMError_imported,
  supportsDOMException as supportsDOMException_imported,
  supportsErrorEvent as supportsErrorEvent_imported,
  supportsFetch as supportsFetch_imported,
  supportsHistory as supportsHistory_imported,
  supportsNativeFetch as supportsNativeFetch_imported,
  supportsReferrerPolicy as supportsReferrerPolicy_imported,
  supportsReportingObserver as supportsReportingObserver_imported,
  timestampInSeconds as timestampInSeconds_imported,
  triggerHandlers as triggerHandlers_imported,
  truncate as truncate_imported,
  updateRateLimits as updateRateLimits_imported,
  urlEncode as urlEncode_imported,
  uuid4 as uuid4_imported,
  vercelWaitUntil as vercelWaitUntil_imported,
  watchdogTimer as watchdogTimer_imported,
  winterCGHeadersToDict as winterCGHeadersToDict_imported,
  winterCGRequestToRequestData as winterCGRequestToRequestData_imported,
} from '@sentry/core';

/** @deprecated Import from `@sentry/core` instead. */
export const applyAggregateErrorsToEvent = applyAggregateErrorsToEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getBreadcrumbLogLevelFromHttpStatusCode = getBreadcrumbLogLevelFromHttpStatusCode_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const dsnFromString = dsnFromString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const dsnToString = dsnToString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const makeDsn = makeDsn_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const SentryError = SentryError_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const GLOBAL_OBJ = GLOBAL_OBJ_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getGlobalSingleton = getGlobalSingleton_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addConsoleInstrumentationHandler = addConsoleInstrumentationHandler_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addFetchEndInstrumentationHandler = addFetchEndInstrumentationHandler_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addFetchInstrumentationHandler = addFetchInstrumentationHandler_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addGlobalErrorInstrumentationHandler = addGlobalErrorInstrumentationHandler_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addGlobalUnhandledRejectionInstrumentationHandler =
  addGlobalUnhandledRejectionInstrumentationHandler_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addHandler = addHandler_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const maybeInstrument = maybeInstrument_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const resetInstrumentationHandlers = resetInstrumentationHandlers_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const triggerHandlers = triggerHandlers_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isDOMError = isDOMError_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isDOMException = isDOMException_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isElement = isElement_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isError = isError_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isErrorEvent = isErrorEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isEvent = isEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isInstanceOf = isInstanceOf_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isParameterizedString = isParameterizedString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isPlainObject = isPlainObject_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isPrimitive = isPrimitive_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isRegExp = isRegExp_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isString = isString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isSyntheticEvent = isSyntheticEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isThenable = isThenable_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isVueViewModel = isVueViewModel_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isBrowser = isBrowser_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const CONSOLE_LEVELS = CONSOLE_LEVELS_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const consoleSandbox = consoleSandbox_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const logger = logger_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const originalConsoleMethods = originalConsoleMethods_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addContextToFrame = addContextToFrame_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addExceptionMechanism = addExceptionMechanism_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addExceptionTypeValue = addExceptionTypeValue_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const checkOrSetAlreadyCaught = checkOrSetAlreadyCaught_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getEventDescription = getEventDescription_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const parseSemver = parseSemver_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const uuid4 = uuid4_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const normalize = normalize_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const normalizeToSize = normalizeToSize_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addNonEnumerableProperty = addNonEnumerableProperty_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const convertToPlainObject = convertToPlainObject_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const dropUndefinedKeys = dropUndefinedKeys_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const extractExceptionKeysForMessage = extractExceptionKeysForMessage_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const fill = fill_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getOriginalFunction = getOriginalFunction_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const markFunctionWrapped = markFunctionWrapped_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const objectify = objectify_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const makePromiseBuffer = makePromiseBuffer_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addNormalizedRequestDataToEvent = addNormalizedRequestDataToEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const winterCGHeadersToDict = winterCGHeadersToDict_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const winterCGRequestToRequestData = winterCGRequestToRequestData_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const severityLevelFromString = severityLevelFromString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const UNKNOWN_FUNCTION = UNKNOWN_FUNCTION_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const createStackParser = createStackParser_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getFramesFromEvent = getFramesFromEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getFunctionName = getFunctionName_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const stackParserFromStackParserOptions = stackParserFromStackParserOptions_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const stripSentryFramesAndReverse = stripSentryFramesAndReverse_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const filenameIsInApp = filenameIsInApp_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const node = node_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const nodeStackLineParser = nodeStackLineParser_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isMatchingPattern = isMatchingPattern_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const safeJoin = safeJoin_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const snipLine = snipLine_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const stringMatchesSomePattern = stringMatchesSomePattern_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const truncate = truncate_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const SyncPromise = SyncPromise_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const rejectedSyncPromise = rejectedSyncPromise_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const resolvedSyncPromise = resolvedSyncPromise_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const dateTimestampInSeconds = dateTimestampInSeconds_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const timestampInSeconds = timestampInSeconds_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const TRACEPARENT_REGEXP = TRACEPARENT_REGEXP_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const extractTraceparentData = extractTraceparentData_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const generateSentryTraceHeader = generateSentryTraceHeader_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const propagationContextFromHeaders = propagationContextFromHeaders_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getSDKSource = getSDKSource_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isBrowserBundle = isBrowserBundle_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const MAX_BAGGAGE_STRING_LENGTH = MAX_BAGGAGE_STRING_LENGTH_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const SENTRY_BAGGAGE_KEY_PREFIX = SENTRY_BAGGAGE_KEY_PREFIX_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const SENTRY_BAGGAGE_KEY_PREFIX_REGEX = SENTRY_BAGGAGE_KEY_PREFIX_REGEX_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const baggageHeaderToDynamicSamplingContext = baggageHeaderToDynamicSamplingContext_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const dynamicSamplingContextToSentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const parseBaggageHeader = parseBaggageHeader_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const addItemToEnvelope = addItemToEnvelope_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const createAttachmentEnvelopeItem = createAttachmentEnvelopeItem_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const createEnvelope = createEnvelope_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const createEventEnvelopeHeaders = createEventEnvelopeHeaders_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const createSpanEnvelopeItem = createSpanEnvelopeItem_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const envelopeContainsItemType = envelopeContainsItemType_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const envelopeItemTypeToDataCategory = envelopeItemTypeToDataCategory_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const forEachEnvelopeItem = forEachEnvelopeItem_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getSdkMetadataForEnvelopeHeader = getSdkMetadataForEnvelopeHeader_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const parseEnvelope = parseEnvelope_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const serializeEnvelope = serializeEnvelope_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const createClientReportEnvelope = createClientReportEnvelope_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const DEFAULT_RETRY_AFTER = DEFAULT_RETRY_AFTER_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const disabledUntil = disabledUntil_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isRateLimited = isRateLimited_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const parseRetryAfterHeader = parseRetryAfterHeader_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const updateRateLimits = updateRateLimits_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const eventFromMessage = eventFromMessage_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const eventFromUnknownInput = eventFromUnknownInput_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const exceptionFromError = exceptionFromError_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const parseStackFrames = parseStackFrames_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const callFrameToStackFrame = callFrameToStackFrame_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const watchdogTimer = watchdogTimer_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const LRUMap = LRUMap_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const generatePropagationContext = generatePropagationContext_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const vercelWaitUntil = vercelWaitUntil_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const SDK_VERSION = SDK_VERSION_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getDebugImagesForResources = getDebugImagesForResources_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getFilenameToDebugIdMap = getFilenameToDebugIdMap_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const escapeStringForRegex = escapeStringForRegex_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const basename = basename_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const dirname = dirname_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isAbsolute = isAbsolute_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const join = join_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const normalizePath = normalizePath_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const relative = relative_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const resolve = resolve_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getComponentName = getComponentName_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getDomElement = getDomElement_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getLocationHref = getLocationHref_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const htmlTreeAsString = htmlTreeAsString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isNativeFunction = isNativeFunction_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsDOMError = supportsDOMError_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsDOMException = supportsDOMException_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsErrorEvent = supportsErrorEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsFetch = supportsFetch_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsNativeFetch = supportsNativeFetch_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsReferrerPolicy = supportsReferrerPolicy_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsReportingObserver = supportsReportingObserver_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const _browserPerformanceTimeOriginMode = _browserPerformanceTimeOriginMode_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const browserPerformanceTimeOrigin = browserPerformanceTimeOrigin_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const supportsHistory = supportsHistory_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const dynamicRequire = dynamicRequire_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const isNodeEnv = isNodeEnv_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const loadModule = loadModule_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const memoBuilder = memoBuilder_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const normalizeUrlToBase = normalizeUrlToBase_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const urlEncode = urlEncode_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const extractPathForTransaction = extractPathForTransaction_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const DEFAULT_USER_INCLUDES = DEFAULT_USER_INCLUDES_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const extractRequestData = extractRequestData_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const addRequestDataToEvent = addRequestDataToEvent_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const getSanitizedUrlString = getSanitizedUrlString_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const parseUrl = parseUrl_imported;

/** @deprecated Import from `@sentry/core` instead. */
export const stripUrlQueryAndFragment = stripUrlQueryAndFragment_imported;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export const makeFifoCache = makeFifoCache_imported;

import type {
  AddRequestDataToEventOptions as AddRequestDataToEventOptions_imported,
  InternalGlobal as InternalGlobal_imported,
  PromiseBuffer as PromiseBuffer_imported,
  RateLimits as RateLimits_imported,
  SdkSource as SdkSource_imported,
  TransactionNamingScheme as TransactionNamingScheme_imported,
} from '@sentry/core';

/** @deprecated Import from `@sentry/core` instead. */
export type InternalGlobal = InternalGlobal_imported;

/** @deprecated Import from `@sentry/core` instead. */
export type SdkSource = SdkSource_imported;

/** @deprecated Import from `@sentry/core` instead. */
export type RateLimits = RateLimits_imported;

/** @deprecated Import from `@sentry/core` instead. */
export type AddRequestDataToEventOptions = AddRequestDataToEventOptions_imported;

/** @deprecated Import from `@sentry/core` instead. */
export type PromiseBuffer<T> = PromiseBuffer_imported<T>;

/** @deprecated Import from `@sentry/core` instead. */
// eslint-disable-next-line deprecation/deprecation
export type TransactionNamingScheme = TransactionNamingScheme_imported;
