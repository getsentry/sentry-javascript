import type { record as rrwebRecord } from '@sentry-internal/rrweb';

import type { RecordingEvent, ReplayEventWithTime } from '../../src/types';
import { ReplayEventTypeFullSnapshot, ReplayEventTypeIncrementalSnapshot } from '../../src/types';

type RecordAdditionalProperties = {
  takeFullSnapshot: jest.Mock;

  // Below are not mocked
  addCustomEvent: () => void;
  freezePage: () => void;
  mirror: unknown;

  // Custom property to fire events in tests, does not exist in rrweb.record
  _emitter: (event: RecordingEvent, ...args: any[]) => void;
};

export type RecordMock = jest.MockedFunction<typeof rrwebRecord> & RecordAdditionalProperties;

function createCheckoutPayload(isCheckout: boolean = true): ReplayEventWithTime {
  return {
    data: { isCheckout },
    timestamp: Date.now(),
    type: isCheckout ? ReplayEventTypeFullSnapshot : ReplayEventTypeIncrementalSnapshot,
  };
}

export function mockRrweb(): { record: RecordMock } {
  const mockRecordFn: jest.Mock & Partial<RecordAdditionalProperties> = jest.fn(({ emit }) => {
    mockRecordFn._emitter = emit;

    emit(createCheckoutPayload());
    return function stop() {
      mockRecordFn._emitter = jest.fn();
    };
  });
  mockRecordFn.takeFullSnapshot = jest.fn((isCheckout: boolean) => {
    if (!mockRecordFn._emitter) {
      return;
    }

    mockRecordFn._emitter(createCheckoutPayload(isCheckout), isCheckout);
  });

  jest.mock('@sentry-internal/rrweb', () => {
    const ActualRrweb = jest.requireActual('@sentry-internal/rrweb');

    mockRecordFn.mirror = ActualRrweb.record.mirror;

    return {
      ...ActualRrweb,
      record: mockRecordFn,
    };
  });

  return {
    record: mockRecordFn as RecordMock,
  };
}
