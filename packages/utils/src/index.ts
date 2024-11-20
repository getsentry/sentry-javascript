export {
  applyAggregateErrorsToEvent,
  getBreadcrumbLogLevelFromHttpStatusCode,
  dsnFromString,
  dsnToString,
  makeDsn,
  SentryError,
  GLOBAL_OBJ,
  getGlobalSingleton,
  addConsoleInstrumentationHandler,
  addFetchEndInstrumentationHandler,
  addFetchInstrumentationHandler,
  addGlobalErrorInstrumentationHandler,
  addGlobalUnhandledRejectionInstrumentationHandler,
  addHandler,
  maybeInstrument,
  resetInstrumentationHandlers,
  triggerHandlers,
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
  isBrowser,
  CONSOLE_LEVELS,
  consoleSandbox,
  logger,
  originalConsoleMethods,
  addContextToFrame,
  addExceptionMechanism,
  addExceptionTypeValue,
  checkOrSetAlreadyCaught,
  getEventDescription,
  parseSemver,
  uuid4,
  normalize,
  normalizeToSize,
  addNonEnumerableProperty,
  convertToPlainObject,
  dropUndefinedKeys,
  extractExceptionKeysForMessage,
  fill,
  getOriginalFunction,
  markFunctionWrapped,
  objectify,
  makePromiseBuffer,
  addNormalizedRequestDataToEvent,
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  severityLevelFromString,
  validSeverityLevels,
  UNKNOWN_FUNCTION,
  createStackParser,
  getFramesFromEvent,
  getFunctionName,
  stackParserFromStackParserOptions,
  stripSentryFramesAndReverse,
  filenameIsInApp,
  node,
  nodeStackLineParser,
  isMatchingPattern,
  safeJoin,
  snipLine,
  stringMatchesSomePattern,
  truncate,
  SyncPromise,
  rejectedSyncPromise,
  resolvedSyncPromise,
  dateTimestampInSeconds,
  timestampInSeconds,
  TRACEPARENT_REGEXP,
  extractTraceparentData,
  generateSentryTraceHeader,
  propagationContextFromHeaders,
  getSDKSource,
  isBrowserBundle,
  MAX_BAGGAGE_STRING_LENGTH,
  SENTRY_BAGGAGE_KEY_PREFIX,
  SENTRY_BAGGAGE_KEY_PREFIX_REGEX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  parseBaggageHeader,
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
  createClientReportEnvelope,
  DEFAULT_RETRY_AFTER,
  disabledUntil,
  isRateLimited,
  parseRetryAfterHeader,
  updateRateLimits,
  eventFromMessage,
  eventFromUnknownInput,
  exceptionFromError,
  parseStackFrames,
  callFrameToStackFrame,
  watchdogTimer,
  LRUMap,
  generatePropagationContext,
  vercelWaitUntil,
  SDK_VERSION,
  getDebugImagesForResources,
  getFilenameToDebugIdMap,
  escapeStringForRegex,
  basename,
  dirname,
  isAbsolute,
  join,
  normalizePath,
  relative,
  resolve,
  getComponentName,
  getDomElement,
  getLocationHref,
  htmlTreeAsString,
  isNativeFunction,
  supportsDOMError,
  supportsDOMException,
  supportsErrorEvent,
  supportsFetch,
  supportsNativeFetch,
  supportsReferrerPolicy,
  supportsReportingObserver,
  _browserPerformanceTimeOriginMode,
  browserPerformanceTimeOrigin,
  supportsHistory,
  dynamicRequire,
  isNodeEnv,
  loadModule,
  flatten,
  memoBuilder,
  arrayify,
  normalizeUrlToBase,
  urlEncode,
  // eslint-disable-next-line deprecation/deprecation
  extractPathForTransaction,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  addRequestDataToEvent,
  _asyncNullishCoalesce,
  _asyncOptionalChain,
  _asyncOptionalChainDelete,
  _nullishCoalesce,
  _optionalChain,
  _optionalChainDelete,
  BAGGAGE_HEADER_NAME,
  getNumberOfUrlSegments,
  getSanitizedUrlString,
  parseUrl,
  stripUrlQueryAndFragment,
  makeFifoCache,
} from '@sentry/core';

export type {
  InternalGlobal,
  PromiseBuffer,
  RateLimits,
  AddRequestDataToEventOptions,
  SdkSource,
  // eslint-disable-next-line deprecation/deprecation
  TransactionNamingScheme,
} from '@sentry/core';

// TODO(v9/lforst): Uncomment below to add deprecation notices

// import {
//   applyAggregateErrorsToEvent as applyAggregateErrorsToEvent_imported,
//   getBreadcrumbLogLevelFromHttpStatusCode as getBreadcrumbLogLevelFromHttpStatusCode_imported,
//   dsnFromString as dsnFromString_imported,
//   dsnToString as dsnToString_imported,
//   makeDsn as makeDsn_imported,
//   SentryError as SentryError_imported,
//   GLOBAL_OBJ as GLOBAL_OBJ_imported,
//   getGlobalSingleton as getGlobalSingleton_imported,
//   addConsoleInstrumentationHandler as addConsoleInstrumentationHandler_imported,
//   addFetchEndInstrumentationHandler as addFetchEndInstrumentationHandler_imported,
//   addFetchInstrumentationHandler as addFetchInstrumentationHandler_imported,
//   addGlobalErrorInstrumentationHandler as addGlobalErrorInstrumentationHandler_imported,
//   addGlobalUnhandledRejectionInstrumentationHandler as addGlobalUnhandledRejectionInstrumentationHandler_imported,
//   addHandler as addHandler_imported,
//   maybeInstrument as maybeInstrument_imported,
//   resetInstrumentationHandlers as resetInstrumentationHandlers_imported,
//   triggerHandlers as triggerHandlers_imported,
//   isDOMError as isDOMError_imported,
//   isDOMException as isDOMException_imported,
//   isElement as isElement_imported,
//   isError as isError_imported,
//   isErrorEvent as isErrorEvent_imported,
//   isEvent as isEvent_imported,
//   isInstanceOf as isInstanceOf_imported,
//   isParameterizedString as isParameterizedString_imported,
//   isPlainObject as isPlainObject_imported,
//   isPrimitive as isPrimitive_imported,
//   isRegExp as isRegExp_imported,
//   isString as isString_imported,
//   isSyntheticEvent as isSyntheticEvent_imported,
//   isThenable as isThenable_imported,
//   isVueViewModel as isVueViewModel_imported,
//   isBrowser as isBrowser_imported,
//   CONSOLE_LEVELS as CONSOLE_LEVELS_imported,
//   consoleSandbox as consoleSandbox_imported,
//   logger as logger_imported,
//   originalConsoleMethods as originalConsoleMethods_imported,
//   addContextToFrame as addContextToFrame_imported,
//   addExceptionMechanism as addExceptionMechanism_imported,
//   addExceptionTypeValue as addExceptionTypeValue_imported,
//   checkOrSetAlreadyCaught as checkOrSetAlreadyCaught_imported,
//   getEventDescription as getEventDescription_imported,
//   parseSemver as parseSemver_imported,
//   uuid4 as uuid4_imported,
//   normalize as normalize_imported,
//   normalizeToSize as normalizeToSize_imported,
//   addNonEnumerableProperty as addNonEnumerableProperty_imported,
//   convertToPlainObject as convertToPlainObject_imported,
//   dropUndefinedKeys as dropUndefinedKeys_imported,
//   extractExceptionKeysForMessage as extractExceptionKeysForMessage_imported,
//   fill as fill_imported,
//   getOriginalFunction as getOriginalFunction_imported,
//   markFunctionWrapped as markFunctionWrapped_imported,
//   objectify as objectify_imported,
//   makePromiseBuffer as makePromiseBuffer_imported,
//   addNormalizedRequestDataToEvent as addNormalizedRequestDataToEvent_imported,
//   winterCGHeadersToDict as winterCGHeadersToDict_imported,
//   winterCGRequestToRequestData as winterCGRequestToRequestData_imported,
//   severityLevelFromString as severityLevelFromString_imported,
//   validSeverityLevels as validSeverityLevels_imported,
//   UNKNOWN_FUNCTION as UNKNOWN_FUNCTION_imported,
//   createStackParser as createStackParser_imported,
//   getFramesFromEvent as getFramesFromEvent_imported,
//   getFunctionName as getFunctionName_imported,
//   stackParserFromStackParserOptions as stackParserFromStackParserOptions_imported,
//   stripSentryFramesAndReverse as stripSentryFramesAndReverse_imported,
//   filenameIsInApp as filenameIsInApp_imported,
//   node as node_imported,
//   nodeStackLineParser as nodeStackLineParser_imported,
//   isMatchingPattern as isMatchingPattern_imported,
//   safeJoin as safeJoin_imported,
//   snipLine as snipLine_imported,
//   stringMatchesSomePattern as stringMatchesSomePattern_imported,
//   truncate as truncate_imported,
//   SyncPromise as SyncPromise_imported,
//   rejectedSyncPromise as rejectedSyncPromise_imported,
//   resolvedSyncPromise as resolvedSyncPromise_imported,
//   dateTimestampInSeconds as dateTimestampInSeconds_imported,
//   timestampInSeconds as timestampInSeconds_imported,
//   TRACEPARENT_REGEXP as TRACEPARENT_REGEXP_imported,
//   extractTraceparentData as extractTraceparentData_imported,
//   generateSentryTraceHeader as generateSentryTraceHeader_imported,
//   propagationContextFromHeaders as propagationContextFromHeaders_imported,
//   getSDKSource as getSDKSource_imported,
//   isBrowserBundle as isBrowserBundle_imported,
//   MAX_BAGGAGE_STRING_LENGTH as MAX_BAGGAGE_STRING_LENGTH_imported,
//   SENTRY_BAGGAGE_KEY_PREFIX as SENTRY_BAGGAGE_KEY_PREFIX_imported,
//   SENTRY_BAGGAGE_KEY_PREFIX_REGEX as SENTRY_BAGGAGE_KEY_PREFIX_REGEX_imported,
//   baggageHeaderToDynamicSamplingContext as baggageHeaderToDynamicSamplingContext_imported,
//   dynamicSamplingContextToSentryBaggageHeader as dynamicSamplingContextToSentryBaggageHeader_imported,
//   parseBaggageHeader as parseBaggageHeader_imported,
//   addItemToEnvelope as addItemToEnvelope_imported,
//   createAttachmentEnvelopeItem as createAttachmentEnvelopeItem_imported,
//   createEnvelope as createEnvelope_imported,
//   createEventEnvelopeHeaders as createEventEnvelopeHeaders_imported,
//   createSpanEnvelopeItem as createSpanEnvelopeItem_imported,
//   envelopeContainsItemType as envelopeContainsItemType_imported,
//   envelopeItemTypeToDataCategory as envelopeItemTypeToDataCategory_imported,
//   forEachEnvelopeItem as forEachEnvelopeItem_imported,
//   getSdkMetadataForEnvelopeHeader as getSdkMetadataForEnvelopeHeader_imported,
//   parseEnvelope as parseEnvelope_imported,
//   serializeEnvelope as serializeEnvelope_imported,
//   createClientReportEnvelope as createClientReportEnvelope_imported,
//   DEFAULT_RETRY_AFTER as DEFAULT_RETRY_AFTER_imported,
//   disabledUntil as disabledUntil_imported,
//   isRateLimited as isRateLimited_imported,
//   parseRetryAfterHeader as parseRetryAfterHeader_imported,
//   updateRateLimits as updateRateLimits_imported,
//   eventFromMessage as eventFromMessage_imported,
//   eventFromUnknownInput as eventFromUnknownInput_imported,
//   exceptionFromError as exceptionFromError_imported,
//   parseStackFrames as parseStackFrames_imported,
//   callFrameToStackFrame as callFrameToStackFrame_imported,
//   watchdogTimer as watchdogTimer_imported,
//   LRUMap as LRUMap_imported,
//   generatePropagationContext as generatePropagationContext_imported,
//   vercelWaitUntil as vercelWaitUntil_imported,
//   SDK_VERSION as SDK_VERSION_imported,
//   getDebugImagesForResources as getDebugImagesForResources_imported,
//   getFilenameToDebugIdMap as getFilenameToDebugIdMap_imported,
//   escapeStringForRegex as escapeStringForRegex_imported,
//   basename as basename_imported,
//   dirname as dirname_imported,
//   isAbsolute as isAbsolute_imported,
//   join as join_imported,
//   normalizePath as normalizePath_imported,
//   relative as relative_imported,
//   resolve as resolve_imported,
//   getComponentName as getComponentName_imported,
//   getDomElement as getDomElement_imported,
//   getLocationHref as getLocationHref_imported,
//   htmlTreeAsString as htmlTreeAsString_imported,
//   isNativeFunction as isNativeFunction_imported,
//   supportsDOMError as supportsDOMError_imported,
//   supportsDOMException as supportsDOMException_imported,
//   supportsErrorEvent as supportsErrorEvent_imported,
//   supportsFetch as supportsFetch_imported,
//   supportsNativeFetch as supportsNativeFetch_imported,
//   supportsReferrerPolicy as supportsReferrerPolicy_imported,
//   supportsReportingObserver as supportsReportingObserver_imported,
//   _browserPerformanceTimeOriginMode as _browserPerformanceTimeOriginMode_imported,
//   browserPerformanceTimeOrigin as browserPerformanceTimeOrigin_imported,
//   supportsHistory as supportsHistory_imported,
//   dynamicRequire as dynamicRequire_imported,
//   isNodeEnv as isNodeEnv_imported,
//   loadModule as loadModule_imported,
//   flatten as flatten_imported,
//   memoBuilder as memoBuilder_imported,
//   arrayify as arrayify_imported,
//   normalizeUrlToBase as normalizeUrlToBase_imported,
//   urlEncode as urlEncode_imported,
//   extractPathForTransaction as extractPathForTransaction_imported,
//   DEFAULT_USER_INCLUDES as DEFAULT_USER_INCLUDES_imported,
//   extractRequestData as extractRequestData_imported,
//   addRequestDataToEvent as addRequestDataToEvent_imported,
//   _asyncNullishCoalesce as _asyncNullishCoalesce_imported,
//   _asyncOptionalChain as _asyncOptionalChain_imported,
//   _asyncOptionalChainDelete as _asyncOptionalChainDelete_imported,
//   _nullishCoalesce as _nullishCoalesce_imported,
//   _optionalChain as _optionalChain_imported,
//   _optionalChainDelete as _optionalChainDelete_imported,
//   BAGGAGE_HEADER_NAME as BAGGAGE_HEADER_NAME_imported,
//   getNumberOfUrlSegments as getNumberOfUrlSegments_imported,
//   getSanitizedUrlString as getSanitizedUrlString_imported,
//   parseUrl as parseUrl_imported,
//   stripUrlQueryAndFragment as stripUrlQueryAndFragment_imported,
//   makeFifoCache as makeFifoCache_imported,
// } from '@sentry/core';

// export const applyAggregateErrorsToEvent = applyAggregateErrorsToEvent_imported;
// export const getBreadcrumbLogLevelFromHttpStatusCode = getBreadcrumbLogLevelFromHttpStatusCode_imported;
// export const dsnFromString = dsnFromString_imported;
// export const dsnToString = dsnToString_imported;
// export const makeDsn = makeDsn_imported;
// export const SentryError = SentryError_imported;
// export const GLOBAL_OBJ = GLOBAL_OBJ_imported;
// export const getGlobalSingleton = getGlobalSingleton_imported;
// export const addConsoleInstrumentationHandler = addConsoleInstrumentationHandler_imported;
// export const addFetchEndInstrumentationHandler = addFetchEndInstrumentationHandler_imported;
// export const addFetchInstrumentationHandler = addFetchInstrumentationHandler_imported;
// export const addGlobalErrorInstrumentationHandler = addGlobalErrorInstrumentationHandler_imported;
// export const addGlobalUnhandledRejectionInstrumentationHandler =
//   addGlobalUnhandledRejectionInstrumentationHandler_imported;
// export const addHandler = addHandler_imported;
// export const maybeInstrument = maybeInstrument_imported;
// export const resetInstrumentationHandlers = resetInstrumentationHandlers_imported;
// export const triggerHandlers = triggerHandlers_imported;
// export const isDOMError = isDOMError_imported;
// export const isDOMException = isDOMException_imported;
// export const isElement = isElement_imported;
// export const isError = isError_imported;
// export const isErrorEvent = isErrorEvent_imported;
// export const isEvent = isEvent_imported;
// export const isInstanceOf = isInstanceOf_imported;
// export const isParameterizedString = isParameterizedString_imported;
// export const isPlainObject = isPlainObject_imported;
// export const isPrimitive = isPrimitive_imported;
// export const isRegExp = isRegExp_imported;
// export const isString = isString_imported;
// export const isSyntheticEvent = isSyntheticEvent_imported;
// export const isThenable = isThenable_imported;
// export const isVueViewModel = isVueViewModel_imported;
// export const isBrowser = isBrowser_imported;
// export const CONSOLE_LEVELS = CONSOLE_LEVELS_imported;
// export const consoleSandbox = consoleSandbox_imported;
// export const logger = logger_imported;
// export const originalConsoleMethods = originalConsoleMethods_imported;
// export const addContextToFrame = addContextToFrame_imported;
// export const addExceptionMechanism = addExceptionMechanism_imported;
// export const addExceptionTypeValue = addExceptionTypeValue_imported;
// export const checkOrSetAlreadyCaught = checkOrSetAlreadyCaught_imported;
// export const getEventDescription = getEventDescription_imported;
// export const parseSemver = parseSemver_imported;
// export const uuid4 = uuid4_imported;
// export const normalize = normalize_imported;
// export const normalizeToSize = normalizeToSize_imported;
// export const addNonEnumerableProperty = addNonEnumerableProperty_imported;
// export const convertToPlainObject = convertToPlainObject_imported;
// export const dropUndefinedKeys = dropUndefinedKeys_imported;
// export const extractExceptionKeysForMessage = extractExceptionKeysForMessage_imported;
// export const fill = fill_imported;
// export const getOriginalFunction = getOriginalFunction_imported;
// export const markFunctionWrapped = markFunctionWrapped_imported;
// export const objectify = objectify_imported;
// export const makePromiseBuffer = makePromiseBuffer_imported;
// export const addNormalizedRequestDataToEvent = addNormalizedRequestDataToEvent_imported;
// export const winterCGHeadersToDict = winterCGHeadersToDict_imported;
// export const winterCGRequestToRequestData = winterCGRequestToRequestData_imported;
// export const severityLevelFromString = severityLevelFromString_imported;
// export const validSeverityLevels = validSeverityLevels_imported;
// export const UNKNOWN_FUNCTION = UNKNOWN_FUNCTION_imported;
// export const createStackParser = createStackParser_imported;
// export const getFramesFromEvent = getFramesFromEvent_imported;
// export const getFunctionName = getFunctionName_imported;
// export const stackParserFromStackParserOptions = stackParserFromStackParserOptions_imported;
// export const stripSentryFramesAndReverse = stripSentryFramesAndReverse_imported;
// export const filenameIsInApp = filenameIsInApp_imported;
// export const node = node_imported;
// export const nodeStackLineParser = nodeStackLineParser_imported;
// export const isMatchingPattern = isMatchingPattern_imported;
// export const safeJoin = safeJoin_imported;
// export const snipLine = snipLine_imported;
// export const stringMatchesSomePattern = stringMatchesSomePattern_imported;
// export const truncate = truncate_imported;
// export const SyncPromise = SyncPromise_imported;
// export const rejectedSyncPromise = rejectedSyncPromise_imported;
// export const resolvedSyncPromise = resolvedSyncPromise_imported;
// export const dateTimestampInSeconds = dateTimestampInSeconds_imported;
// export const timestampInSeconds = timestampInSeconds_imported;
// export const TRACEPARENT_REGEXP = TRACEPARENT_REGEXP_imported;
// export const extractTraceparentData = extractTraceparentData_imported;
// export const generateSentryTraceHeader = generateSentryTraceHeader_imported;
// export const propagationContextFromHeaders = propagationContextFromHeaders_imported;
// export const getSDKSource = getSDKSource_imported;
// export const isBrowserBundle = isBrowserBundle_imported;
// export const MAX_BAGGAGE_STRING_LENGTH = MAX_BAGGAGE_STRING_LENGTH_imported;
// export const SENTRY_BAGGAGE_KEY_PREFIX = SENTRY_BAGGAGE_KEY_PREFIX_imported;
// export const SENTRY_BAGGAGE_KEY_PREFIX_REGEX = SENTRY_BAGGAGE_KEY_PREFIX_REGEX_imported;
// export const baggageHeaderToDynamicSamplingContext = baggageHeaderToDynamicSamplingContext_imported;
// export const dynamicSamplingContextToSentryBaggageHeader = dynamicSamplingContextToSentryBaggageHeader_imported;
// export const parseBaggageHeader = parseBaggageHeader_imported;
// export const addItemToEnvelope = addItemToEnvelope_imported;
// export const createAttachmentEnvelopeItem = createAttachmentEnvelopeItem_imported;
// export const createEnvelope = createEnvelope_imported;
// export const createEventEnvelopeHeaders = createEventEnvelopeHeaders_imported;
// export const createSpanEnvelopeItem = createSpanEnvelopeItem_imported;
// export const envelopeContainsItemType = envelopeContainsItemType_imported;
// export const envelopeItemTypeToDataCategory = envelopeItemTypeToDataCategory_imported;
// export const forEachEnvelopeItem = forEachEnvelopeItem_imported;
// export const getSdkMetadataForEnvelopeHeader = getSdkMetadataForEnvelopeHeader_imported;
// export const parseEnvelope = parseEnvelope_imported;
// export const serializeEnvelope = serializeEnvelope_imported;
// export const createClientReportEnvelope = createClientReportEnvelope_imported;
// export const DEFAULT_RETRY_AFTER = DEFAULT_RETRY_AFTER_imported;
// export const disabledUntil = disabledUntil_imported;
// export const isRateLimited = isRateLimited_imported;
// export const parseRetryAfterHeader = parseRetryAfterHeader_imported;
// export const updateRateLimits = updateRateLimits_imported;
// export const eventFromMessage = eventFromMessage_imported;
// export const eventFromUnknownInput = eventFromUnknownInput_imported;
// export const exceptionFromError = exceptionFromError_imported;
// export const parseStackFrames = parseStackFrames_imported;
// export const callFrameToStackFrame = callFrameToStackFrame_imported;
// export const watchdogTimer = watchdogTimer_imported;
// export const LRUMap = LRUMap_imported;
// export const generatePropagationContext = generatePropagationContext_imported;
// export const vercelWaitUntil = vercelWaitUntil_imported;
// export const SDK_VERSION = SDK_VERSION_imported;
// export const getDebugImagesForResources = getDebugImagesForResources_imported;
// export const getFilenameToDebugIdMap = getFilenameToDebugIdMap_imported;
// export const escapeStringForRegex = escapeStringForRegex_imported;
// export const basename = basename_imported;
// export const dirname = dirname_imported;
// export const isAbsolute = isAbsolute_imported;
// export const join = join_imported;
// export const normalizePath = normalizePath_imported;
// export const relative = relative_imported;
// export const resolve = resolve_imported;
// export const getComponentName = getComponentName_imported;
// export const getDomElement = getDomElement_imported;
// export const getLocationHref = getLocationHref_imported;
// export const htmlTreeAsString = htmlTreeAsString_imported;
// export const isNativeFunction = isNativeFunction_imported;
// export const supportsDOMError = supportsDOMError_imported;
// export const supportsDOMException = supportsDOMException_imported;
// export const supportsErrorEvent = supportsErrorEvent_imported;
// export const supportsFetch = supportsFetch_imported;
// export const supportsNativeFetch = supportsNativeFetch_imported;
// export const supportsReferrerPolicy = supportsReferrerPolicy_imported;
// export const supportsReportingObserver = supportsReportingObserver_imported;
// export const _browserPerformanceTimeOriginMode = _browserPerformanceTimeOriginMode_imported;
// export const browserPerformanceTimeOrigin = browserPerformanceTimeOrigin_imported;
// export const supportsHistory = supportsHistory_imported;
// export const dynamicRequire = dynamicRequire_imported;
// export const isNodeEnv = isNodeEnv_imported;
// export const loadModule = loadModule_imported;
// export const flatten = flatten_imported;
// export const memoBuilder = memoBuilder_imported;
// export const arrayify = arrayify_imported;
// export const normalizeUrlToBase = normalizeUrlToBase_imported;
// export const urlEncode = urlEncode_imported;
// export const extractPathForTransaction = extractPathForTransaction_imported;
// export const DEFAULT_USER_INCLUDES = DEFAULT_USER_INCLUDES_imported;
// export const extractRequestData = extractRequestData_imported;
// export const addRequestDataToEvent = addRequestDataToEvent_imported;
// export const _asyncNullishCoalesce = _asyncNullishCoalesce_imported;
// export const _asyncOptionalChain = _asyncOptionalChain_imported;
// export const _asyncOptionalChainDelete = _asyncOptionalChainDelete_imported;
// export const _nullishCoalesce = _nullishCoalesce_imported;
// export const _optionalChain = _optionalChain_imported;
// export const _optionalChainDelete = _optionalChainDelete_imported;
// export const BAGGAGE_HEADER_NAME = BAGGAGE_HEADER_NAME_imported;
// export const getNumberOfUrlSegments = getNumberOfUrlSegments_imported;
// export const getSanitizedUrlString = getSanitizedUrlString_imported;
// export const parseUrl = parseUrl_imported;
// export const stripUrlQueryAndFragment = stripUrlQueryAndFragment_imported;
// export const makeFifoCache = makeFifoCache_imported;

// import type {
//   InternalGlobal as InternalGlobal_imported,
//   PromiseBuffer as PromiseBuffer_imported,
//   RateLimits as RateLimits_imported,
//   AddRequestDataToEventOptions as AddRequestDataToEventOptions_imported,
//   SdkSource as SdkSource_imported,
//   TransactionNamingScheme as TransactionNamingScheme_imported,
// } from '@sentry/core';

// export type InternalGlobal = InternalGlobal_imported;
// export type SdkSource = SdkSource_imported;
// export type RateLimits = RateLimits_imported;
// export type AddRequestDataToEventOptions = AddRequestDataToEventOptions_imported;
// export type PromiseBuffer<T> = PromiseBuffer_imported<T>;
// export type TransactionNamingScheme = TransactionNamingScheme_imported;
