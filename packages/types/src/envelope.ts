import { ClientReport } from './clientreport';
import { DsnComponents } from './dsn';
import { Event } from './event';
import { SdkInfo } from './sdkinfo';
import { Session, SessionAggregates } from './session';
import { Transaction } from './transaction';
import { UserFeedback } from './user';

// Based on: https://develop.sentry.dev/sdk/envelopes/

// Based on https://github.com/getsentry/relay/blob/b23b8d3b2360a54aaa4d19ecae0231201f31df5e/relay-sampling/src/lib.rs#L685-L707
export type DynamicSamplingContext = {
  trace_id: Transaction['traceId'];
  public_key: DsnComponents['publicKey'];
  sample_rate?: string;
  release?: string;
  environment?: string;
  transaction?: string;
  user_segment?: string;
};

export type EnvelopeItemType =
  | 'client_report'
  | 'user_report'
  | 'session'
  | 'sessions'
  | 'transaction'
  | 'attachment'
  | 'event';

export type BaseEnvelopeHeaders = {
  [key: string]: unknown;
  dsn?: string;
  sdk?: SdkInfo;
};

export type BaseEnvelopeItemHeaders = {
  [key: string]: unknown;
  type: EnvelopeItemType;
  length?: number;
};

type BaseEnvelopeItem<IH extends BaseEnvelopeItemHeaders, P extends unknown> = [IH, P]; // P is for payload

type BaseEnvelope<EH extends BaseEnvelopeHeaders, I extends BaseEnvelopeItem<BaseEnvelopeItemHeaders, unknown>> = [
  EH,
  I[],
];

type EventItemHeaders = {
  type: 'event' | 'transaction';
};
type AttachmentItemHeaders = {
  type: 'attachment';
  length: number;
  filename: string;
  content_type?: string;
  attachment_type?: string;
};
type UserFeedbackItemHeaders = { type: 'user_report' };
type SessionItemHeaders = { type: 'session' };
type SessionAggregatesItemHeaders = { type: 'sessions' };
type ClientReportItemHeaders = { type: 'client_report' };

export type EventItem = BaseEnvelopeItem<EventItemHeaders, Event>;
export type AttachmentItem = BaseEnvelopeItem<AttachmentItemHeaders, string | Uint8Array>;
export type UserFeedbackItem = BaseEnvelopeItem<UserFeedbackItemHeaders, UserFeedback>;
export type SessionItem =
  | BaseEnvelopeItem<SessionItemHeaders, Session>
  | BaseEnvelopeItem<SessionAggregatesItemHeaders, SessionAggregates>;
export type ClientReportItem = BaseEnvelopeItem<ClientReportItemHeaders, ClientReport>;

export type EventEnvelopeHeaders = { event_id: string; sent_at: string; trace?: DynamicSamplingContext };
type SessionEnvelopeHeaders = { sent_at: string };
type ClientReportEnvelopeHeaders = BaseEnvelopeHeaders;

export type EventEnvelope = BaseEnvelope<EventEnvelopeHeaders, EventItem | AttachmentItem | UserFeedbackItem>;
export type SessionEnvelope = BaseEnvelope<SessionEnvelopeHeaders, SessionItem>;
export type ClientReportEnvelope = BaseEnvelope<ClientReportEnvelopeHeaders, ClientReportItem>;

export type Envelope = EventEnvelope | SessionEnvelope | ClientReportEnvelope;
export type EnvelopeItem = Envelope[1][number];
