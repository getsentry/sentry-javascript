import { DataCategory } from './transport';

export type EventDropReason =
  | 'before_send'
  | 'event_processor'
  | 'network_error'
  | 'queue_overflow'
  | 'ratelimit_backoff'
  | 'sample_rate';

export interface Outcome {
  reason: EventDropReason;
  category: DataCategory;
  quantity: number;
}

export type ClientReport = {
  timestamp: number;
  discarded_events: Outcome[];
};
