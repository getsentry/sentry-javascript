export type { Attachment } from './attachment';
export type {
  Breadcrumb,
  BreadcrumbHint,
  FetchBreadcrumbData,
  XhrBreadcrumbData,
  FetchBreadcrumbHint,
  XhrBreadcrumbHint,
} from './breadcrumb';
export type { Client } from './client';
export type { ClientReport, Outcome, EventDropReason } from './clientreport';
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
} from './context';
export type { DataCategory } from './datacategory';
export type { DsnComponents, DsnLike, DsnProtocol } from './dsn';
export type { DebugImage, DebugMeta } from './debugMeta';
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
  StatsdItem,
  StatsdEnvelope,
  ProfileItem,
  ProfileChunkEnvelope,
  ProfileChunkItem,
  SpanEnvelope,
  SpanItem,
} from './envelope';
export type { ExtendedError } from './error';
export type { Event, EventHint, EventType, ErrorEvent, TransactionEvent } from './event';
export type { EventProcessor } from './eventprocessor';
export type { Exception } from './exception';
export type { Extra, Extras } from './extra';
// eslint-disable-next-line deprecation/deprecation
export type { Hub } from './hub';
export type { Integration, IntegrationClass, IntegrationFn } from './integration';
export type { Mechanism } from './mechanism';
export type { ExtractedNodeRequestData, HttpHeaderValue, Primitive, WorkerLocation } from './misc';
export type { ClientOptions, Options } from './options';
export type { Package } from './package';
export type { PolymorphicEvent, PolymorphicRequest } from './polymorphics';
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
} from './profiling';
export type { ReplayEvent, ReplayRecordingData, ReplayRecordingMode } from './replay';
export type {
  FeedbackEvent,
  FeedbackFormData,
  FeedbackInternalOptions,
  FeedbackModalIntegration,
  FeedbackScreenshotIntegration,
  SendFeedback,
  SendFeedbackParams,
  UserFeedback,
} from './feedback';
export type { QueryParams, Request, SanitizedRequestData } from './request';
export type { Runtime } from './runtime';
export type { CaptureContext, Scope, ScopeContext, ScopeData } from './scope';
export type { SdkInfo } from './sdkinfo';
export type { SdkMetadata } from './sdkmetadata';
export type {
  SessionAggregates,
  AggregationCounts,
  Session,
  SessionContext,
  SessionStatus,
  RequestSession,
  RequestSessionStatus,
  SessionFlusherLike,
  SerializedSession,
} from './session';

export type { SeverityLevel } from './severity';
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
  MetricSummary,
} from './span';
export type { SpanStatus } from './spanStatus';
export type { TimedEvent } from './timedEvent';
export type { StackFrame } from './stackframe';
export type { Stacktrace, StackParser, StackLineParser, StackLineParserFn } from './stacktrace';
export type { PropagationContext, TracePropagationTargets, SerializedTraceData } from './tracing';
export type { StartSpanOptions } from './startSpanOptions';
export type {
  TraceparentData,
  TransactionSource,
} from './transaction';
export type { CustomSamplingContext, SamplingContext } from './samplingcontext';
export type {
  DurationUnit,
  InformationUnit,
  FractionUnit,
  MeasurementUnit,
  NoneUnit,
  Measurements,
} from './measurement';
export type { Thread } from './thread';
export type {
  Transport,
  TransportRequest,
  TransportMakeRequestResponse,
  InternalBaseTransportOptions,
  BaseTransportOptions,
  TransportRequestExecutor,
} from './transport';
export type { User } from './user';
export type { WebFetchHeaders, WebFetchRequest } from './webfetchapi';
export type { WrappedFunction } from './wrappedfunction';
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
} from './instrument';

export type { BrowserClientReplayOptions, BrowserClientProfilingOptions } from './browseroptions';
export type { CheckIn, MonitorConfig, FinishedCheckIn, InProgressCheckIn, SerializedCheckIn } from './checkin';
export type {
  MetricsAggregator,
  MetricBucketItem,
  MetricInstance,
  MetricData,
  Metrics,
} from './metrics';
export type { ParameterizedString } from './parameterize';
export type { ContinuousProfiler, ProfilingIntegration, Profiler } from './profiling';
export type { ViewHierarchyData, ViewHierarchyWindow } from './view-hierarchy';
