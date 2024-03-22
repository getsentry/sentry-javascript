// eslint-disable-next-line deprecation/deprecation
import type { ReplayEventType, ReplayEventWithTime } from '../../src';
import { ReplayEventTypeFullSnapshot, ReplayEventTypeIncrementalSnapshot } from '../../src/types';

export function getTestEvent({
  timestamp,
  type,
  data,
}: {
  timestamp: number;
  data?: any;
  // eslint-disable-next-line deprecation/deprecation
  type: ReplayEventType;
  // eslint-disable-next-line deprecation/deprecation
}): ReplayEventWithTime {
  return {
    data: data || {},
    timestamp,
    type,
  };
}

// eslint-disable-next-line deprecation/deprecation
export function getTestEventCheckout({ timestamp, data }: { timestamp: number; data?: any }): ReplayEventWithTime {
  return getTestEvent({ timestamp, data, type: ReplayEventTypeFullSnapshot });
}

// eslint-disable-next-line deprecation/deprecation
export function getTestEventIncremental({ timestamp, data }: { timestamp: number; data?: any }): ReplayEventWithTime {
  return getTestEvent({ timestamp, data, type: ReplayEventTypeIncrementalSnapshot });
}
