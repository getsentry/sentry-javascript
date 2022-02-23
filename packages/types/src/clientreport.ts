import { SentryRequestType } from './request';
import { Outcome } from './transport';

export type ClientReport = {
  timestamp: number;
  discarded_events: { reason: Outcome; category: SentryRequestType; quantity: number };
};
