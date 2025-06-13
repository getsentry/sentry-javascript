/* eslint-disable max-lines */

export type { ClientClass as SentryCoreCurrentScopes } from './sdk';
export type { AsyncContextStrategy } from './asyncContext/types';
export type { Carrier } from './carrier';
export type { OfflineStore, OfflineTransportOptions } from './transports/offline';
export type { ServerRuntimeClientOptions } from './server-runtime-client';
export type { IntegrationIndex } from './integration';

export * from './tracing';
export * from './semanticAttributes';
export { createEventEnvelope, createSessionEnvelope, createSpanEnvelope } from './envelope';
export {
  captureCheckIn,
  withMonitor,
  captureException,
  captureEvent,
  captureMessage,
  lastEventId,
  close,
  flush,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  isInitialized,
  isEnabled,
  startSession,
  endSession,
  captureSession,
  addEventProcessor,
} from './exports';
export {
  getCurrentScope,
  getIsolationScope,
  getGlobalScope,
  withScope,
  withIsolationScope,
  getClient,
  getTraceContextFromScope,
} from './currentScopes';
export { getDefaultCurrentScope, getDefaultIsolationScope } from './defaultScopes';
export { setAsyncContextStrategy } from './asyncContext';
export { getGlobalSingleton, getMainCarrier } from './carrier';
export { makeSession, closeSession, updateSession } from './session';
export { Scope } from './scope';
export type { CaptureContext, ScopeContext, ScopeData } from './scope';
export { notifyEventProcessors } from './eventProcessors';
export { getEnvelopeEndpointWithUrlEncodedAuth, getReportDialogEndpoint } from './api';
export {
  Client,
  // eslint-disable-next-line deprecation/deprecation
  BaseClient,
} from './client';
export { ServerRuntimeClient } from './server-runtime-client';
export { initAndBind, setCurrentClient } from './sdk';
export { createTransport } from './transports/base';
export { makeOfflineTransport } from './transports/offline';
export { makeMultiplexedTransport } from './transports/multiplexed';
export { getIntegrationsToSetup, addIntegration, defineIntegration } from './integration';
export { applyScopeDataToEvent, mergeScopeData } from './utils/applyScopeDataToEvent';
export { prepareEvent } from './utils/prepareEvent';
export { createCheckInEnvelope } from './checkin';
// eslint-disable-next-line deprecation/deprecation
export { hasTracingEnabled } from './utils/hasSpansEnabled';
export { hasSpansEnabled } from './utils/hasSpansEnabled';
export { isSentryRequestUrl } from './utils/isSentryRequestUrl';
export { handleCallbackErrors } from './utils/handleCallbackErrors';
export { parameterize, fmt } from './utils/parameterize';
export { addAutoIpAddressToSession, addAutoIpAddressToUser } from './utils/ipAddress';
export {
  convertSpanLinksForEnvelope,
  spanToTraceHeader,
  spanToJSON,
  spanIsSampled,
  spanToTraceContext,
  getSpanDescendants,
  getStatusMessage,
  getRootSpan,
  getActiveSpan,
  addChildSpanToSpan,
  spanTimeInputToSeconds,
  updateSpanName,
} from './utils/spanUtils';
export { parseSampleRate } from './utils/parseSampleRate';
export { applySdkMetadata } from './utils/sdkMetadata';
export { getTraceData } from './utils/traceData';
export { getTraceMetaTags } from './utils/meta';
export { debounce } from './utils/debounce';
export {
  winterCGHeadersToDict,
  winterCGRequestToRequestData,
  httpRequestToRequestData,
  extractQueryParamsFromUrl,
  headersToDict,
} from './utils/request';
export { DEFAULT_ENVIRONMENT } from './constants';
export { addBreadcrumb } from './breadcrumbs';
export { functionToStringIntegration } from './integrations/functiontostring';
// eslint-disable-next-line deprecation/deprecation
export { inboundFiltersIntegration } from './integrations/eventFilters';
export { eventFiltersIntegration } from './integrations/eventFilters';
export { linkedErrorsIntegration } from './integrations/linkederrors';
export { moduleMetadataIntegration } from './integrations/metadata';
export { requestDataIntegration } from './integrations/requestdata';
export { captureConsoleIntegration } from './integrations/captureconsole';
export { dedupeIntegration } from './integrations/dedupe';
export { extraErrorDataIntegration } from './integrations/extraerrordata';
export { rewriteFramesIntegration } from './integrations/rewriteframes';
export { supabaseIntegration, instrumentSupabaseClient } from './integrations/supabase';
export { zodErrorsIntegration } from './integrations/zoderrors';
export { thirdPartyErrorFilterIntegration } from './integrations/third-party-errors-filter';
export { consoleIntegration } from './integrations/console';

export { profiler } from './profiling';
export { instrumentFetchRequest } from './fetch';
export { trpcMiddleware } from './trpc';
export { wrapMcpServerWithSentry } from './mcp-server';
export { captureFeedback } from './feedback';
export type { ReportDialogOptions } from './report-dialog';
export { _INTERNAL_captureLog, _INTERNAL_flushLogsBuffer, _INTERNAL_captureSerializedLog } from './logs/exports';
export { consoleLoggingIntegration } from './logs/console-integration';

export type { FeatureFlag } from './featureFlags';

export { applyAggregateErrorsToEvent } from './utils-hoist/aggregate-errors';
export { getBreadcrumbLogLevelFromHttpStatusCode } from './utils-hoist/breadcrumb-log-level';
export { getComponentName, getLocationHref, htmlTreeAsString } from './utils-hoist/browser';
export { dsnFromString, dsnToString, makeDsn } from './utils-hoist/dsn';
// eslint-disable-next-line deprecation/deprecation
export { SentryError } from './utils-hoist/error';
export { GLOBAL_OBJ } from './utils-hoist/worldwide';
export type { InternalGlobal } from './utils-hoist/worldwide';
export { addConsoleInstrumentationHandler } from './utils-hoist/instrument/console';
export { addFetchEndInstrumentationHandler, addFetchInstrumentationHandler } from './utils-hoist/instrument/fetch';
export { addGlobalErrorInstrumentationHandler } from './utils-hoist/instrument/globalError';
export { addGlobalUnhandledRejectionInstrumentationHandler } from './utils-hoist/instrument/globalUnhandledRejection';
export {
  addHandler,
  maybeInstrument,
  resetInstrumentationHandlers,
  triggerHandlers,
} from './utils-hoist/instrument/handlers';
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
} from './utils-hoist/is';
export { isBrowser } from './utils-hoist/isBrowser';
export { CONSOLE_LEVELS, consoleSandbox, logger, originalConsoleMethods } from './utils-hoist/logger';
export type { Logger } from './utils-hoist/logger';
export {
  addContextToFrame,
  addExceptionMechanism,
  addExceptionTypeValue,
  checkOrSetAlreadyCaught,
  getEventDescription,
  parseSemver,
  uuid4,
} from './utils-hoist/misc';
export { isNodeEnv, loadModule } from './utils-hoist/node';
export { normalize, normalizeToSize, normalizeUrlToBase } from './utils-hoist/normalize';
export {
  addNonEnumerableProperty,
  convertToPlainObject,
  // eslint-disable-next-line deprecation/deprecation
  dropUndefinedKeys,
  extractExceptionKeysForMessage,
  fill,
  getOriginalFunction,
  markFunctionWrapped,
  objectify,
} from './utils-hoist/object';
export { basename, dirname, isAbsolute, join, normalizePath, relative, resolve } from './utils-hoist/path';
export { makePromiseBuffer, SENTRY_BUFFER_FULL_ERROR } from './utils-hoist/promisebuffer';
export type { PromiseBuffer } from './utils-hoist/promisebuffer';
export { severityLevelFromString } from './utils-hoist/severity';
export {
  UNKNOWN_FUNCTION,
  createStackParser,
  getFramesFromEvent,
  getFunctionName,
  stackParserFromStackParserOptions,
  stripSentryFramesAndReverse,
} from './utils-hoist/stacktrace';
export { filenameIsInApp, node, nodeStackLineParser } from './utils-hoist/node-stack-trace';
export { isMatchingPattern, safeJoin, snipLine, stringMatchesSomePattern, truncate } from './utils-hoist/string';
export {
  isNativeFunction,
  supportsDOMError,
  supportsDOMException,
  supportsErrorEvent,
  // eslint-disable-next-line deprecation/deprecation
  supportsFetch,
  supportsHistory,
  supportsNativeFetch,
  // eslint-disable-next-line deprecation/deprecation
  supportsReferrerPolicy,
  supportsReportingObserver,
} from './utils-hoist/supports';
export { SyncPromise, rejectedSyncPromise, resolvedSyncPromise } from './utils-hoist/syncpromise';
export { browserPerformanceTimeOrigin, dateTimestampInSeconds, timestampInSeconds } from './utils-hoist/time';
export {
  TRACEPARENT_REGEXP,
  extractTraceparentData,
  generateSentryTraceHeader,
  propagationContextFromHeaders,
} from './utils-hoist/tracing';
export { getSDKSource, isBrowserBundle } from './utils-hoist/env';
export type { SdkSource } from './utils-hoist/env';
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
} from './utils-hoist/envelope';
export { createClientReportEnvelope } from './utils-hoist/clientreport';
export {
  DEFAULT_RETRY_AFTER,
  disabledUntil,
  isRateLimited,
  parseRetryAfterHeader,
  updateRateLimits,
} from './utils-hoist/ratelimit';
export type { RateLimits } from './utils-hoist/ratelimit';
export {
  MAX_BAGGAGE_STRING_LENGTH,
  SENTRY_BAGGAGE_KEY_PREFIX,
  SENTRY_BAGGAGE_KEY_PREFIX_REGEX,
  baggageHeaderToDynamicSamplingContext,
  dynamicSamplingContextToSentryBaggageHeader,
  parseBaggageHeader,
  objectToBaggageHeader,
} from './utils-hoist/baggage';
export {
  getSanitizedUrlString,
  parseUrl,
  stripUrlQueryAndFragment,
  parseStringToURLObject,
  getHttpSpanDetailsFromUrlObject,
  isURLObjectRelative,
  getSanitizedUrlStringFromUrlObject,
} from './utils-hoist/url';
export {
  eventFromMessage,
  eventFromUnknownInput,
  exceptionFromError,
  parseStackFrames,
} from './utils-hoist/eventbuilder';
export { callFrameToStackFrame, watchdogTimer } from './utils-hoist/anr';
export { LRUMap } from './utils-hoist/lru';
export { generateTraceId, generateSpanId } from './utils-hoist/propagationContext';
export { vercelWaitUntil } from './utils-hoist/vercelWaitUntil';
export { SDK_VERSION } from './utils-hoist/version';
export { getDebugImagesForResources, getFilenameToDebugIdMap } from './utils-hoist/debug-ids';
export { escapeStringForRegex } from './utils-hoist/vendor/escapeStringForRegex';

export type { Attachment } from './types-hoist/attachment';
export type {
  Breadcrumb,
  BreadcrumbHint,
  FetchBreadcrumbData,
  XhrBreadcrumbData,
  FetchBreadcrumbHint,
  XhrBreadcrumbHint,
} from './types-hoist/breadcrumb';
export type { ClientReport, Outcome, EventDropReason } from './types-hoist/clientreport';
export type {
  Context,
  Contexts,
  DeviceContext,
  OsContext,
  AppContext,
  CultureContext,
  TraceContext,
  CloudResourceContext,
  MissingInstrumentationContext,
} from './types-hoist/context';
export type { DataCategory } from './types-hoist/datacategory';
export type { DsnComponents, DsnLike, DsnProtocol } from './types-hoist/dsn';
export type { DebugImage, DebugMeta } from './types-hoist/debugMeta';
export type {
  AttachmentItem,
  BaseEnvelopeHeaders,
  BaseEnvelopeItemHeaders,
  ClientReportEnvelope,
  ClientReportItem,
  DynamicSamplingContext,
  Envelope,
  EnvelopeItemType,
  EnvelopeItem,
  EventEnvelope,
  EventEnvelopeHeaders,
  EventItem,
  ReplayEnvelope,
  FeedbackItem,
  SessionEnvelope,
  SessionItem,
  UserFeedbackItem,
  CheckInItem,
  CheckInEnvelope,
  RawSecurityEnvelope,
  RawSecurityItem,
  ProfileItem,
  ProfileChunkEnvelope,
  ProfileChunkItem,
  SpanEnvelope,
  SpanItem,
  LogEnvelope,
} from './types-hoist/envelope';
export type { ExtendedError } from './types-hoist/error';
export type { Event, EventHint, EventType, ErrorEvent, TransactionEvent } from './types-hoist/event';
export type { EventProcessor } from './types-hoist/eventprocessor';
export type { Exception } from './types-hoist/exception';
export type { Extra, Extras } from './types-hoist/extra';
export type { Integration, IntegrationFn } from './types-hoist/integration';
export type { Mechanism } from './types-hoist/mechanism';
export type { ExtractedNodeRequestData, HttpHeaderValue, Primitive, WorkerLocation } from './types-hoist/misc';
export type { ClientOptions, Options } from './types-hoist/options';
export type { Package } from './types-hoist/package';
export type { PolymorphicEvent, PolymorphicRequest } from './types-hoist/polymorphics';
export type {
  ThreadId,
  FrameId,
  StackId,
  ThreadCpuSample,
  ThreadCpuStack,
  ThreadCpuFrame,
  ThreadCpuProfile,
  ContinuousThreadCpuProfile,
  Profile,
  ProfileChunk,
} from './types-hoist/profiling';
export type { ReplayEvent, ReplayRecordingData, ReplayRecordingMode } from './types-hoist/replay';
export type {
  FeedbackEvent,
  FeedbackFormData,
  FeedbackInternalOptions,
  FeedbackModalIntegration,
  FeedbackScreenshotIntegration,
  SendFeedback,
  SendFeedbackParams,
  UserFeedback,
} from './types-hoist/feedback';
export type { QueryParams, RequestEventData, SanitizedRequestData } from './types-hoist/request';
export type { Runtime } from './types-hoist/runtime';
export type { SdkInfo } from './types-hoist/sdkinfo';
export type { SdkMetadata } from './types-hoist/sdkmetadata';
export type {
  SessionAggregates,
  AggregationCounts,
  Session,
  SessionContext,
  SessionStatus,
  SerializedSession,
} from './types-hoist/session';
export type { SeverityLevel } from './types-hoist/severity';
export type {
  Span,
  SentrySpanArguments,
  SpanOrigin,
  SpanAttributeValue,
  SpanAttributes,
  SpanTimeInput,
  SpanJSON,
  SpanContextData,
  TraceFlag,
} from './types-hoist/span';
export type { SpanStatus } from './types-hoist/spanStatus';
export type { Log, LogSeverityLevel } from './types-hoist/log';
export type { TimedEvent } from './types-hoist/timedEvent';
export type { StackFrame } from './types-hoist/stackframe';
export type { Stacktrace, StackParser, StackLineParser, StackLineParserFn } from './types-hoist/stacktrace';
export type { PropagationContext, TracePropagationTargets, SerializedTraceData } from './types-hoist/tracing';
export type { StartSpanOptions } from './types-hoist/startSpanOptions';
export type { TraceparentData, TransactionSource } from './types-hoist/transaction';
export type { CustomSamplingContext, SamplingContext } from './types-hoist/samplingcontext';
export type {
  DurationUnit,
  InformationUnit,
  FractionUnit,
  MeasurementUnit,
  NoneUnit,
  Measurements,
} from './types-hoist/measurement';
export type { Thread } from './types-hoist/thread';
export type {
  Transport,
  TransportRequest,
  TransportMakeRequestResponse,
  InternalBaseTransportOptions,
  BaseTransportOptions,
  TransportRequestExecutor,
} from './types-hoist/transport';
export type { User } from './types-hoist/user';
export type { WebFetchHeaders, WebFetchRequest } from './types-hoist/webfetchapi';
export type { WrappedFunction } from './types-hoist/wrappedfunction';
export type {
  HandlerDataFetch,
  HandlerDataXhr,
  HandlerDataDom,
  HandlerDataConsole,
  HandlerDataHistory,
  HandlerDataError,
  HandlerDataUnhandledRejection,
  ConsoleLevel,
  SentryXhrData,
  SentryWrappedXMLHttpRequest,
} from './types-hoist/instrument';
export type { BrowserClientReplayOptions, BrowserClientProfilingOptions } from './types-hoist/browseroptions';
export type {
  CheckIn,
  MonitorConfig,
  FinishedCheckIn,
  InProgressCheckIn,
  SerializedCheckIn,
} from './types-hoist/checkin';
export type { ParameterizedString } from './types-hoist/parameterize';
export type { ContinuousProfiler, ProfilingIntegration, Profiler } from './types-hoist/profiling';
export type { ViewHierarchyData, ViewHierarchyWindow } from './types-hoist/view-hierarchy';
export type { LegacyCSPReport } from './types-hoist/csp';
export type { SerializedLog, SerializedLogContainer } from './types-hoist/log';
