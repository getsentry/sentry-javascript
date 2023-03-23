import type { ClientReport } from './clientreport';
import type { DsnComponents } from './dsn';
import type { Event } from './event';
import type { ReplayEvent, ReplayRecordingData } from './replay';
import type { SdkInfo } from './sdkinfo';
import type { Session, SessionAggregates } from './session';
import type { Transaction } from './transaction';
import type { UserFeedback } from './user';

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
  | 'event'
  | 'profile'
  | 'replay_event'
  | 'replay_recording';

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

type BaseEnvelopeItem<ItemHeader, P> = [ItemHeader & BaseEnvelopeItemHeaders, P]; // P is for payload

type BaseEnvelope<EnvelopeHeader, Item> = [
  EnvelopeHeader & BaseEnvelopeHeaders,
  Array<Item & BaseEnvelopeItem<BaseEnvelopeItemHeaders, unknown>>,
];

type EventItemHeaders = {
  type: 'event' | 'transaction' | 'profile';
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
type ReplayEventItemHeaders = { type: 'replay_event' };
type ReplayRecordingItemHeaders = { type: 'replay_recording'; length: number };

export type EventItem = BaseEnvelopeItem<EventItemHeaders, Event>;
export type AttachmentItem = BaseEnvelopeItem<AttachmentItemHeaders, string | Uint8Array>;
export type UserFeedbackItem = BaseEnvelopeItem<UserFeedbackItemHeaders, UserFeedback>;
export type SessionItem =
  | BaseEnvelopeItem<SessionItemHeaders, Session>
  | BaseEnvelopeItem<SessionAggregatesItemHeaders, SessionAggregates>;
export type ClientReportItem = BaseEnvelopeItem<ClientReportItemHeaders, ClientReport>;
type ReplayEventItem = BaseEnvelopeItem<ReplayEventItemHeaders, ReplayEvent>;
type ReplayRecordingItem = BaseEnvelopeItem<ReplayRecordingItemHeaders, ReplayRecordingData>;

export type EventEnvelopeHeaders = { event_id: string; sent_at: string; trace?: DynamicSamplingContext };
type SessionEnvelopeHeaders = { sent_at: string };
type ClientReportEnvelopeHeaders = BaseEnvelopeHeaders;
type ReplayEnvelopeHeaders = BaseEnvelopeHeaders;

export type EventEnvelope = BaseEnvelope<EventEnvelopeHeaders, EventItem | AttachmentItem | UserFeedbackItem>;
export type SessionEnvelope = BaseEnvelope<SessionEnvelopeHeaders, SessionItem>;
export type ClientReportEnvelope = BaseEnvelope<ClientReportEnvelopeHeaders, ClientReportItem>;
export type ReplayEnvelope = [ReplayEnvelopeHeaders, [ReplayEventItem, ReplayRecordingItem]];

export type Envelope = EventEnvelope | SessionEnvelope | ClientReportEnvelope | ReplayEnvelope;
export type EnvelopeItem = Envelope[1][number];
