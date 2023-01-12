import type { DataCategory } from './datacategory';

export type EventDropReason =
  | 'before_send'
  | 'event_processor'
  | 'network_error'
  | 'queue_overflow'
  | 'ratelimit_backoff'
  | 'sample_rate';

export type Outcome = {
  reason: EventDropReason;
  category: DataCategory;
  quantity: number;
};

export type ClientReport = {
  timestamp: number;
  discarded_events: Outcome[];
};
