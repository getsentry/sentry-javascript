import type { ReplayEventType, ReplayEventWithTime } from '../../src';
import { ReplayEventTypeFullSnapshot, ReplayEventTypeIncrementalSnapshot } from '../../src/types';

export function getTestEvent({
  timestamp,
  type,
  data,
}: {
  timestamp: number;
  data?: any;
  type: ReplayEventType;
}): ReplayEventWithTime {
  return {
    data: data || {},
    timestamp,
    type,
  };
}

export function getTestEventCheckout({ timestamp, data }: { timestamp: number; data?: any }): ReplayEventWithTime {
  return getTestEvent({ timestamp, data, type: ReplayEventTypeFullSnapshot });
}

export function getTestEventIncremental({ timestamp, data }: { timestamp: number; data?: any }): ReplayEventWithTime {
  return getTestEvent({ timestamp, data, type: ReplayEventTypeIncrementalSnapshot });
}
