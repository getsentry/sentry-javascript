/* eslint-disable max-lines */
import type {
  AggregationCounts as AggregationCounts_imported,
  AppContext as AppContext_imported,
  Attachment as Attachment_imported,
  AttachmentItem as AttachmentItem_imported,
  BaseEnvelopeHeaders as BaseEnvelopeHeaders_imported,
  BaseEnvelopeItemHeaders as BaseEnvelopeItemHeaders_imported,
  BaseTransportOptions as BaseTransportOptions_imported,
  Breadcrumb as Breadcrumb_imported,
  BreadcrumbHint as BreadcrumbHint_imported,
  BrowserClientProfilingOptions as BrowserClientProfilingOptions_imported,
  BrowserClientReplayOptions as BrowserClientReplayOptions_imported,
  CaptureContext as CaptureContext_imported,
  CheckIn as CheckIn_imported,
  CheckInEnvelope as CheckInEnvelope_imported,
  CheckInItem as CheckInItem_imported,
  Client as Client_imported,
  ClientOptions as ClientOptions_imported,
  ClientReport as ClientReport_imported,
  ClientReportEnvelope as ClientReportEnvelope_imported,
  ClientReportItem as ClientReportItem_imported,
  CloudResourceContext as CloudResourceContext_imported,
  ConsoleLevel as ConsoleLevel_imported,
  Context as Context_imported,
  Contexts as Contexts_imported,
  ContinuousProfiler as ContinuousProfiler_imported,
  ContinuousThreadCpuProfile as ContinuousThreadCpuProfile_imported,
  CultureContext as CultureContext_imported,
  CustomSamplingContext as CustomSamplingContext_imported,
  DataCategory as DataCategory_imported,
  DebugImage as DebugImage_imported,
  DebugMeta as DebugMeta_imported,
  DeviceContext as DeviceContext_imported,
  DsnComponents as DsnComponents_imported,
  DsnLike as DsnLike_imported,
  DsnProtocol as DsnProtocol_imported,
  DurationUnit as DurationUnit_imported,
  DynamicSamplingContext as DynamicSamplingContext_imported,
  Envelope as Envelope_imported,
  EnvelopeItem as EnvelopeItem_imported,
  EnvelopeItemType as EnvelopeItemType_imported,
  ErrorEvent as ErrorEvent_imported,
  Event as Event_imported,
  EventDropReason as EventDropReason_imported,
  EventEnvelope as EventEnvelope_imported,
  EventEnvelopeHeaders as EventEnvelopeHeaders_imported,
  EventHint as EventHint_imported,
  EventItem as EventItem_imported,
  EventProcessor as EventProcessor_imported,
  EventType as EventType_imported,
  Exception as Exception_imported,
  ExtendedError as ExtendedError_imported,
  Extra as Extra_imported,
  ExtractedNodeRequestData as ExtractedNodeRequestData_imported,
  Extras as Extras_imported,
  FeedbackEvent as FeedbackEvent_imported,
  FeedbackFormData as FeedbackFormData_imported,
  FeedbackInternalOptions as FeedbackInternalOptions_imported,
  FeedbackItem as FeedbackItem_imported,
  FeedbackModalIntegration as FeedbackModalIntegration_imported,
  FeedbackScreenshotIntegration as FeedbackScreenshotIntegration_imported,
  FetchBreadcrumbData as FetchBreadcrumbData_imported,
  FetchBreadcrumbHint as FetchBreadcrumbHint_imported,
  FinishedCheckIn as FinishedCheckIn_imported,
  FractionUnit as FractionUnit_imported,
  FrameId as FrameId_imported,
  HandlerDataConsole as HandlerDataConsole_imported,
  HandlerDataDom as HandlerDataDom_imported,
  HandlerDataError as HandlerDataError_imported,
  HandlerDataFetch as HandlerDataFetch_imported,
  HandlerDataHistory as HandlerDataHistory_imported,
  HandlerDataUnhandledRejection as HandlerDataUnhandledRejection_imported,
  HandlerDataXhr as HandlerDataXhr_imported,
  HttpHeaderValue as HttpHeaderValue_imported,
  InformationUnit as InformationUnit_imported,
  InProgressCheckIn as InProgressCheckIn_imported,
  Integration as Integration_imported,
  IntegrationFn as IntegrationFn_imported,
  InternalBaseTransportOptions as InternalBaseTransportOptions_imported,
  Measurements as Measurements_imported,
  MeasurementUnit as MeasurementUnit_imported,
  Mechanism as Mechanism_imported,
  MissingInstrumentationContext as MissingInstrumentationContext_imported,
  MonitorConfig as MonitorConfig_imported,
  NoneUnit as NoneUnit_imported,
  Options as Options_imported,
  OsContext as OsContext_imported,
  Outcome as Outcome_imported,
  Package as Package_imported,
  ParameterizedString as ParameterizedString_imported,
  PolymorphicEvent as PolymorphicEvent_imported,
  PolymorphicRequest as PolymorphicRequest_imported,
  Primitive as Primitive_imported,
  Profile as Profile_imported,
  ProfileChunk as ProfileChunk_imported,
  ProfileChunkEnvelope as ProfileChunkEnvelope_imported,
  ProfileChunkItem as ProfileChunkItem_imported,
  ProfileItem as ProfileItem_imported,
  Profiler as Profiler_imported,
  ProfilingIntegration as ProfilingIntegration_imported,
  PropagationContext as PropagationContext_imported,
  QueryParams as QueryParams_imported,
  ReplayEnvelope as ReplayEnvelope_imported,
  ReplayEvent as ReplayEvent_imported,
  ReplayRecordingData as ReplayRecordingData_imported,
  ReplayRecordingMode as ReplayRecordingMode_imported,
  RequestEventData as RequestEventData_imported,
  Runtime as Runtime_imported,
  SamplingContext as SamplingContext_imported,
  SanitizedRequestData as SanitizedRequestData_imported,
  Scope as Scope_imported,
  ScopeContext as ScopeContext_imported,
  ScopeData as ScopeData_imported,
  SdkInfo as SdkInfo_imported,
  SdkMetadata as SdkMetadata_imported,
  SendFeedback as SendFeedback_imported,
  SendFeedbackParams as SendFeedbackParams_imported,
  SentrySpanArguments as SentrySpanArguments_imported,
  SentryWrappedXMLHttpRequest as SentryWrappedXMLHttpRequest_imported,
  SentryXhrData as SentryXhrData_imported,
  SerializedCheckIn as SerializedCheckIn_imported,
  SerializedSession as SerializedSession_imported,
  SerializedTraceData as SerializedTraceData_imported,
  Session as Session_imported,
  SessionAggregates as SessionAggregates_imported,
  SessionContext as SessionContext_imported,
  SessionEnvelope as SessionEnvelope_imported,
  SessionItem as SessionItem_imported,
  SessionStatus as SessionStatus_imported,
  SeverityLevel as SeverityLevel_imported,
  Span as Span_imported,
  SpanAttributes as SpanAttributes_imported,
  SpanAttributeValue as SpanAttributeValue_imported,
  SpanContextData as SpanContextData_imported,
  SpanEnvelope as SpanEnvelope_imported,
  SpanItem as SpanItem_imported,
  SpanJSON as SpanJSON_imported,
  SpanOrigin as SpanOrigin_imported,
  SpanStatus as SpanStatus_imported,
  SpanTimeInput as SpanTimeInput_imported,
  StackFrame as StackFrame_imported,
  StackId as StackId_imported,
  StackLineParser as StackLineParser_imported,
  StackLineParserFn as StackLineParserFn_imported,
  StackParser as StackParser_imported,
  Stacktrace as Stacktrace_imported,
  StartSpanOptions as StartSpanOptions_imported,
  Thread as Thread_imported,
  ThreadCpuFrame as ThreadCpuFrame_imported,
  ThreadCpuProfile as ThreadCpuProfile_imported,
  ThreadCpuSample as ThreadCpuSample_imported,
  ThreadCpuStack as ThreadCpuStack_imported,
  ThreadId as ThreadId_imported,
  TimedEvent as TimedEvent_imported,
  TraceContext as TraceContext_imported,
  TraceFlag as TraceFlag_imported,
  TraceparentData as TraceparentData_imported,
  TracePropagationTargets as TracePropagationTargets_imported,
  TransactionEvent as TransactionEvent_imported,
  TransactionSource as TransactionSource_imported,
  Transport as Transport_imported,
  TransportMakeRequestResponse as TransportMakeRequestResponse_imported,
  TransportRequest as TransportRequest_imported,
  TransportRequestExecutor as TransportRequestExecutor_imported,
  User as User_imported,
  UserFeedback as UserFeedback_imported,
  UserFeedbackItem as UserFeedbackItem_imported,
  ViewHierarchyData as ViewHierarchyData_imported,
  ViewHierarchyWindow as ViewHierarchyWindow_imported,
  WebFetchHeaders as WebFetchHeaders_imported,
  WebFetchRequest as WebFetchRequest_imported,
  WorkerLocation as WorkerLocation_imported,
  WrappedFunction as WrappedFunction_imported,
  XhrBreadcrumbData as XhrBreadcrumbData_imported,
  XhrBreadcrumbHint as XhrBreadcrumbHint_imported,
} from '@sentry/core';

/** @deprecated This type has been moved to `@sentry/core`. */
export type Attachment = Attachment_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Breadcrumb = Breadcrumb_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type BreadcrumbHint = BreadcrumbHint_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FetchBreadcrumbData = FetchBreadcrumbData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type XhrBreadcrumbData = XhrBreadcrumbData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FetchBreadcrumbHint = FetchBreadcrumbHint_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type XhrBreadcrumbHint = XhrBreadcrumbHint_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
// eslint-disable-next-line deprecation/deprecation
export type Client<O extends ClientOptions = ClientOptions<BaseTransportOptions>> = Client_imported<O>;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ClientReport = ClientReport_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Outcome = Outcome_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventDropReason = EventDropReason_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Context = Context_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Contexts = Contexts_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DeviceContext = DeviceContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type OsContext = OsContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type AppContext = AppContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CultureContext = CultureContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TraceContext = TraceContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CloudResourceContext = CloudResourceContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type MissingInstrumentationContext = MissingInstrumentationContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DataCategory = DataCategory_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DsnComponents = DsnComponents_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DsnLike = DsnLike_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DsnProtocol = DsnProtocol_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DebugImage = DebugImage_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DebugMeta = DebugMeta_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type AttachmentItem = AttachmentItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type BaseEnvelopeHeaders = BaseEnvelopeHeaders_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type BaseEnvelopeItemHeaders = BaseEnvelopeItemHeaders_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ClientReportEnvelope = ClientReportEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ClientReportItem = ClientReportItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DynamicSamplingContext = DynamicSamplingContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Envelope = Envelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EnvelopeItemType = EnvelopeItemType_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EnvelopeItem = EnvelopeItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventEnvelope = EventEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventEnvelopeHeaders = EventEnvelopeHeaders_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventItem = EventItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ReplayEnvelope = ReplayEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FeedbackItem = FeedbackItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SessionEnvelope = SessionEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SessionItem = SessionItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type UserFeedbackItem = UserFeedbackItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CheckInItem = CheckInItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CheckInEnvelope = CheckInEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ProfileItem = ProfileItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ProfileChunkEnvelope = ProfileChunkEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ProfileChunkItem = ProfileChunkItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanEnvelope = SpanEnvelope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanItem = SpanItem_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ExtendedError = ExtendedError_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Event = Event_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventHint = EventHint_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventType = EventType_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ErrorEvent = ErrorEvent_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TransactionEvent = TransactionEvent_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type EventProcessor = EventProcessor_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Exception = Exception_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Extra = Extra_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Extras = Extras_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Integration = Integration_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
// eslint-disable-next-line deprecation/deprecation
export type IntegrationFn<IntegrationType = Integration> = IntegrationFn_imported<IntegrationType>;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Mechanism = Mechanism_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ExtractedNodeRequestData = ExtractedNodeRequestData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HttpHeaderValue = HttpHeaderValue_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Primitive = Primitive_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type WorkerLocation = WorkerLocation_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
// eslint-disable-next-line deprecation/deprecation
export type ClientOptions<TO extends BaseTransportOptions = BaseTransportOptions> = ClientOptions_imported<TO>;
/** @deprecated This type has been moved to `@sentry/core`. */
// eslint-disable-next-line deprecation/deprecation
export type Options<TO extends BaseTransportOptions = BaseTransportOptions> = Options_imported<TO>;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Package = Package_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type PolymorphicEvent = PolymorphicEvent_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type PolymorphicRequest = PolymorphicRequest_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ThreadId = ThreadId_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FrameId = FrameId_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type StackId = StackId_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ThreadCpuSample = ThreadCpuSample_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ThreadCpuStack = ThreadCpuStack_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ThreadCpuFrame = ThreadCpuFrame_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ThreadCpuProfile = ThreadCpuProfile_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ContinuousThreadCpuProfile = ContinuousThreadCpuProfile_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Profile = Profile_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ProfileChunk = ProfileChunk_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ReplayEvent = ReplayEvent_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ReplayRecordingData = ReplayRecordingData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ReplayRecordingMode = ReplayRecordingMode_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FeedbackEvent = FeedbackEvent_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FeedbackFormData = FeedbackFormData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FeedbackInternalOptions = FeedbackInternalOptions_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FeedbackModalIntegration = FeedbackModalIntegration_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FeedbackScreenshotIntegration = FeedbackScreenshotIntegration_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SendFeedback = SendFeedback_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SendFeedbackParams = SendFeedbackParams_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type UserFeedback = UserFeedback_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type QueryParams = QueryParams_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type RequestEventData = RequestEventData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SanitizedRequestData = SanitizedRequestData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Runtime = Runtime_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CaptureContext = CaptureContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Scope = Scope_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ScopeContext = ScopeContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ScopeData = ScopeData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SdkInfo = SdkInfo_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SdkMetadata = SdkMetadata_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SessionAggregates = SessionAggregates_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type AggregationCounts = AggregationCounts_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Session = Session_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SessionContext = SessionContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SessionStatus = SessionStatus_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SerializedSession = SerializedSession_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SeverityLevel = SeverityLevel_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Span = Span_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SentrySpanArguments = SentrySpanArguments_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanOrigin = SpanOrigin_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanAttributeValue = SpanAttributeValue_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanAttributes = SpanAttributes_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanTimeInput = SpanTimeInput_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanJSON = SpanJSON_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanContextData = SpanContextData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TraceFlag = TraceFlag_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SpanStatus = SpanStatus_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TimedEvent = TimedEvent_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type StackFrame = StackFrame_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Stacktrace = Stacktrace_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type StackParser = StackParser_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type StackLineParser = StackLineParser_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type StackLineParserFn = StackLineParserFn_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type PropagationContext = PropagationContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TracePropagationTargets = TracePropagationTargets_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SerializedTraceData = SerializedTraceData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type StartSpanOptions = StartSpanOptions_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TraceparentData = TraceparentData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TransactionSource = TransactionSource_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CustomSamplingContext = CustomSamplingContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SamplingContext = SamplingContext_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type DurationUnit = DurationUnit_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type InformationUnit = InformationUnit_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FractionUnit = FractionUnit_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type MeasurementUnit = MeasurementUnit_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type NoneUnit = NoneUnit_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Measurements = Measurements_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Thread = Thread_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Transport = Transport_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TransportRequest = TransportRequest_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TransportMakeRequestResponse = TransportMakeRequestResponse_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type InternalBaseTransportOptions = InternalBaseTransportOptions_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type BaseTransportOptions = BaseTransportOptions_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type TransportRequestExecutor = TransportRequestExecutor_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type User = User_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type WebFetchHeaders = WebFetchHeaders_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type WebFetchRequest = WebFetchRequest_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type WrappedFunction<T extends Function = Function> = WrappedFunction_imported<T>;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataFetch = HandlerDataFetch_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataXhr = HandlerDataXhr_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataDom = HandlerDataDom_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataConsole = HandlerDataConsole_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataHistory = HandlerDataHistory_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataError = HandlerDataError_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type HandlerDataUnhandledRejection = HandlerDataUnhandledRejection_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ConsoleLevel = ConsoleLevel_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SentryXhrData = SentryXhrData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SentryWrappedXMLHttpRequest = SentryWrappedXMLHttpRequest_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type BrowserClientReplayOptions = BrowserClientReplayOptions_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type BrowserClientProfilingOptions = BrowserClientProfilingOptions_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type CheckIn = CheckIn_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type MonitorConfig = MonitorConfig_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type FinishedCheckIn = FinishedCheckIn_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type InProgressCheckIn = InProgressCheckIn_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type SerializedCheckIn = SerializedCheckIn_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ParameterizedString = ParameterizedString_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ContinuousProfiler<T extends Client_imported> = ContinuousProfiler_imported<T>;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ProfilingIntegration<T extends Client_imported> = ProfilingIntegration_imported<T>;
/** @deprecated This type has been moved to `@sentry/core`. */
export type Profiler = Profiler_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ViewHierarchyData = ViewHierarchyData_imported;
/** @deprecated This type has been moved to `@sentry/core`. */
export type ViewHierarchyWindow = ViewHierarchyWindow_imported;
