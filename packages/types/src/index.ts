export type { Attachment } from './attachment';
export type { Breadcrumb, BreadcrumbHint } from './breadcrumb';
export type { Client } from './client';
export type { ClientReport, Outcome, EventDropReason } from './clientreport';
export type { Context, Contexts, DeviceContext, OsContext, AppContext, CultureContext, TraceContext } from './context';
export type { DataCategory, ClientReportDataCategory, RateLimitDataCategory } from './datacategory';
export type { DsnComponents, DsnLike, DsnProtocol } from './dsn';
export type { DebugImage, DebugImageType, DebugMeta } from './debugMeta';
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
  SessionEnvelope,
  SessionItem,
  UserFeedbackItem,
} from './envelope';
export type { ExtendedError } from './error';
export type { Event, EventHint, EventType, ErrorEvent, TransactionEvent } from './event';
export type { EventProcessor } from './eventprocessor';
export type { Exception } from './exception';
export type { Extra, Extras } from './extra';
// This is a dummy export, purely for the purpose of loading `globals.ts`, in order to take advantage of its side effect
// of putting variables into the global namespace. See
// https://www.typescriptlang.org/docs/handbook/declaration-files/templates/global-modifying-module-d-ts.html.
export type {} from './globals';
export type { Hub } from './hub';
export type { Integration, IntegrationClass } from './integration';
export type { Mechanism } from './mechanism';
export type { ExtractedNodeRequestData, HttpHeaderValue, Primitive, WorkerLocation } from './misc';
export type { ClientOptions, Options } from './options';
export type { Package } from './package';
export type { PolymorphicEvent, PolymorphicRequest } from './polymorphics';
export type { ReplayEvent, ReplayRecordingData, ReplayRecordingMode } from './replay';
export type { QueryParams, Request } from './request';
export type { Runtime } from './runtime';
export type { CaptureContext, Scope, ScopeContext } from './scope';
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

// eslint-disable-next-line deprecation/deprecation
export type { Severity, SeverityLevel } from './severity';
export type { Span, SpanContext } from './span';
export type { StackFrame } from './stackframe';
export type { Stacktrace, StackParser, StackLineParser, StackLineParserFn } from './stacktrace';
export type { TextEncoderInternal } from './textencoder';
export type { TracePropagationTargets } from './tracing';
export type {
  CustomSamplingContext,
  SamplingContext,
  TraceparentData,
  Transaction,
  TransactionContext,
  TransactionMetadata,
  TransactionSource,
  TransactionNameChange,
} from './transaction';
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
export type { User, UserFeedback } from './user';
export type { WrappedFunction } from './wrappedfunction';
export type { Instrumenter } from './instrumenter';

export type { BrowserClientReplayOptions } from './browseroptions';
