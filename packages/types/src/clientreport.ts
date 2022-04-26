import { Outcome } from './transport';

export type ClientReportCategory = 'default' | 'transaction' | 'error' | 'security' | 'attachment' | 'session';

export type ClientReport = {
  timestamp: number;
  discarded_events: Array<{ reason: Outcome; category: ClientReportCategory; quantity: number }>;
};
