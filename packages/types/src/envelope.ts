import { ClientReport } from './clientreport';
import { Event } from './event';
import { SdkInfo } from './sdkinfo';
import { Session, SessionAggregates } from './session';
import { TransactionSamplingMethod } from './transaction';
import { UserFeedback } from './user';

// Based on: https://develop.sentry.dev/sdk/envelopes/

export type BaseEnvelopeHeaders = {
  [key: string]: unknown;
  dsn?: string;
  sdk?: SdkInfo;
};

export type BaseEnvelopeItemHeaders = {
  [key: string]: unknown;
  type: string;
  length?: number;
};

type BaseEnvelopeItem<IH extends BaseEnvelopeItemHeaders, P extends unknown> = [IH, P]; // P is for payload

// TEMP Comment: We could also infer this type
export type EnvelopeItemType =
  | 'client_report'
  | 'user_report'
  | 'session'
  | 'sessions'
  | 'transaction'
  | 'attachment'
  | 'event';

type BaseEnvelope<EH extends BaseEnvelopeHeaders, I extends BaseEnvelopeItem<BaseEnvelopeItemHeaders, unknown>> = [
  EH,
  I[],
];

type EventItemHeaders = {
  type: 'event' | 'transaction';
  sample_rates?: [{ id?: TransactionSamplingMethod; rate?: number }];
};
type AttachmentItemHeaders = { type: 'attachment'; filename: string };
type UserFeedbackItemHeaders = { type: 'user_report' };
type SessionItemHeaders = { type: 'session' };
type SessionAggregatesItemHeaders = { type: 'sessions' };
type ClientReportItemHeaders = { type: 'client_report' };

// TODO(v7): Remove the string union from `Event | string`
// We have to allow this hack for now as we pre-serialize events because we support
// both store and envelope endpoints.
export type EventItem = BaseEnvelopeItem<EventItemHeaders, Event | string>;
export type AttachmentItem = BaseEnvelopeItem<AttachmentItemHeaders, unknown>;
export type UserFeedbackItem = BaseEnvelopeItem<UserFeedbackItemHeaders, UserFeedback>;
export type SessionItem =
  | BaseEnvelopeItem<SessionItemHeaders, Session>
  | BaseEnvelopeItem<SessionAggregatesItemHeaders, SessionAggregates>;
export type ClientReportItem = BaseEnvelopeItem<ClientReportItemHeaders, ClientReport>;

type EventEnvelopeHeaders = { event_id: string; sent_at: string };
type SessionEnvelopeHeaders = { sent_at: string };
type ClientReportEnvelopeHeaders = BaseEnvelopeHeaders;

export type EventEnvelope = BaseEnvelope<EventEnvelopeHeaders, EventItem | AttachmentItem | UserFeedbackItem>;
export type SessionEnvelope = BaseEnvelope<SessionEnvelopeHeaders, SessionItem>;
export type ClientReportEnvelope = BaseEnvelope<ClientReportEnvelopeHeaders, ClientReportItem>;

export type Envelope = EventEnvelope | SessionEnvelope | ClientReportEnvelope;
