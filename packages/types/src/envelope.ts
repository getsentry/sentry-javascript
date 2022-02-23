import { ClientReport } from './clientreport';
import { Event } from './event';
import { SdkInfo } from './sdkinfo';
import { Session, SessionAggregates } from './session';
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

export type BaseEnvelopeItem<IH extends BaseEnvelopeItemHeaders, P extends unknown> = [IH, P]; // P is for payload

export type BaseEnvelope<
  EH extends BaseEnvelopeHeaders,
  I extends BaseEnvelopeItem<BaseEnvelopeItemHeaders, unknown>,
> = [EH, I[]];

type EventItemHeaders = { type: 'event' | 'transaction' };
type AttachmentItemHeaders = { type: 'attachment'; filename: string };
type UserFeedbackItemHeaders = { type: 'user_report' };
type SessionItemHeaders = { type: 'session' };
type SessionAggregatesItemHeaders = { type: 'sessions' };
type ClientReportItemHeaders = { type: 'client_report' };

export type EventItem = BaseEnvelopeItem<EventItemHeaders, Event>;
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
