import { Breadcrumb } from '@sentry/types';
import type { eventWithTime } from 'rrweb/typings/types';

import { record } from 'rrweb';

export type RRWebEvent = eventWithTime;
export type RRWebOptions = Parameters<typeof record>[0];

export interface ReplaySpan {
  description: string;
  op: string;
  startTimestamp: number;
  endTimestamp: number;
  data?: Record<string, unknown>;
}

export interface ReplayRequest {
  endpoint: string;
  events: RRWebEvent[];
  replaySpans: ReplaySpan[];
  breadcrumbs: Breadcrumb[];
}

export type InstrumentationType = 'scope' | 'dom' | 'fetch' | 'xhr';
