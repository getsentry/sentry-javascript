import type { AttachmentType } from './attachment';
import type { SerializedCheckIn } from './checkin';
import type { ClientReport } from './clientreport';
import type { LegacyCSPReport } from './csp';
import type { DsnComponents } from './dsn';
import type { Event } from './event';
import type { FeedbackEvent, UserFeedback } from './feedback';
import type { SerializedLogContainer } from './log';
import type { Profile, ProfileChunk } from './profiling';
import type { ReplayEvent, ReplayRecordingData } from './replay';
import type { SdkInfo } from './sdkinfo';
import type { SerializedSession, SessionAggregates } from './session';
import type { SpanJSON } from './span';

// Based on: https://develop.sentry.dev/sdk/envelopes/

// Based on https://github.com/getsentry/relay/blob/b23b8d3b2360a54aaa4d19ecae0231201f31df5e/relay-sampling/src/lib.rs#L685-L707
export type DynamicSamplingContext = {
  trace_id: string;
  public_key: DsnComponents['publicKey'];
  sample_rate?: string;
  release?: string;
  environment?: string;
  transaction?: string;
  replay_id?: string;
  sampled?: string;
  sample_rand?: string;
  org_id?: string;
};

// https://github.com/getsentry/relay/blob/311b237cd4471042352fa45e7a0824b8995f216f/relay-server/src/envelope.rs#L154
// https://develop.sentry.dev/sdk/envelopes/#data-model
export type EnvelopeItemType =
  | 'client_report'
  | 'user_report'
  | 'feedback'
  | 'session'
  | 'sessions'
  | 'transaction'
  | 'attachment'
  | 'event'
  | 'profile'
  | 'profile_chunk'
  | 'replay_event'
  | 'replay_recording'
  | 'check_in'
  | 'span'
  | 'log'
  | 'raw_security';

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
  type: 'event' | 'transaction' | 'profile' | 'feedback';
};
type AttachmentItemHeaders = {
  type: 'attachment';
  length: number;
  filename: string;
  content_type?: string;
  attachment_type?: AttachmentType;
};
type UserFeedbackItemHeaders = { type: 'user_report' };
type FeedbackItemHeaders = { type: 'feedback' };
type SessionItemHeaders = { type: 'session' };
type SessionAggregatesItemHeaders = { type: 'sessions' };
type ClientReportItemHeaders = { type: 'client_report' };
type ReplayEventItemHeaders = { type: 'replay_event' };
type ReplayRecordingItemHeaders = { type: 'replay_recording'; length: number };
type CheckInItemHeaders = { type: 'check_in' };
type ProfileItemHeaders = { type: 'profile' };
type ProfileChunkItemHeaders = { type: 'profile_chunk' };
type SpanItemHeaders = { type: 'span' };
type LogContainerItemHeaders = {
  type: 'log';
  /**
   * The number of log items in the container. This must be the same as the number of log items in the payload.
   */
  item_count: number;
  /**
   * The content type of the log items. This must be `application/vnd.sentry.items.log+json`.
   */
  content_type: 'application/vnd.sentry.items.log+json';
};
type RawSecurityHeaders = { type: 'raw_security'; sentry_release?: string; sentry_environment?: string };

export type EventItem = BaseEnvelopeItem<EventItemHeaders, Event>;
export type AttachmentItem = BaseEnvelopeItem<AttachmentItemHeaders, string | Uint8Array>;
export type UserFeedbackItem = BaseEnvelopeItem<UserFeedbackItemHeaders, UserFeedback>;
export type SessionItem =
  | BaseEnvelopeItem<SessionItemHeaders, SerializedSession>
  | BaseEnvelopeItem<SessionAggregatesItemHeaders, SessionAggregates>;
export type ClientReportItem = BaseEnvelopeItem<ClientReportItemHeaders, ClientReport>;
export type CheckInItem = BaseEnvelopeItem<CheckInItemHeaders, SerializedCheckIn>;
type ReplayEventItem = BaseEnvelopeItem<ReplayEventItemHeaders, ReplayEvent>;
type ReplayRecordingItem = BaseEnvelopeItem<ReplayRecordingItemHeaders, ReplayRecordingData>;
export type FeedbackItem = BaseEnvelopeItem<FeedbackItemHeaders, FeedbackEvent>;
export type ProfileItem = BaseEnvelopeItem<ProfileItemHeaders, Profile>;
export type ProfileChunkItem = BaseEnvelopeItem<ProfileChunkItemHeaders, ProfileChunk>;
export type SpanItem = BaseEnvelopeItem<SpanItemHeaders, Partial<SpanJSON>>;
export type LogContainerItem = BaseEnvelopeItem<LogContainerItemHeaders, SerializedLogContainer>;
export type RawSecurityItem = BaseEnvelopeItem<RawSecurityHeaders, LegacyCSPReport>;

export type EventEnvelopeHeaders = { event_id: string; sent_at: string; trace?: Partial<DynamicSamplingContext> };
type SessionEnvelopeHeaders = { sent_at: string };
type CheckInEnvelopeHeaders = { trace?: DynamicSamplingContext };
type ClientReportEnvelopeHeaders = BaseEnvelopeHeaders;
type ReplayEnvelopeHeaders = BaseEnvelopeHeaders;
type SpanEnvelopeHeaders = BaseEnvelopeHeaders & { trace?: DynamicSamplingContext };
type LogEnvelopeHeaders = BaseEnvelopeHeaders;
export type EventEnvelope = BaseEnvelope<
  EventEnvelopeHeaders,
  EventItem | AttachmentItem | UserFeedbackItem | FeedbackItem | ProfileItem
>;
export type SessionEnvelope = BaseEnvelope<SessionEnvelopeHeaders, SessionItem>;
export type ClientReportEnvelope = BaseEnvelope<ClientReportEnvelopeHeaders, ClientReportItem>;
export type ReplayEnvelope = [ReplayEnvelopeHeaders, [ReplayEventItem, ReplayRecordingItem]];
export type CheckInEnvelope = BaseEnvelope<CheckInEnvelopeHeaders, CheckInItem>;
export type SpanEnvelope = BaseEnvelope<SpanEnvelopeHeaders, SpanItem>;
export type ProfileChunkEnvelope = BaseEnvelope<BaseEnvelopeHeaders, ProfileChunkItem>;
export type RawSecurityEnvelope = BaseEnvelope<BaseEnvelopeHeaders, RawSecurityItem>;
export type LogEnvelope = BaseEnvelope<LogEnvelopeHeaders, LogContainerItem>;

export type Envelope =
  | EventEnvelope
  | SessionEnvelope
  | ClientReportEnvelope
  | ProfileChunkEnvelope
  | ReplayEnvelope
  | CheckInEnvelope
  | SpanEnvelope
  | RawSecurityEnvelope
  | LogEnvelope;
export type EnvelopeItem = Envelope[1][number];
