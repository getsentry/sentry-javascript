import { record } from '@sentry-internal/rrweb';
import type { Mock, MockedFunction } from 'vitest';
import { vi } from 'vitest';
import type { RecordingEvent, ReplayEventWithTime } from '../../src/types';
import { ReplayEventTypeFullSnapshot, ReplayEventTypeIncrementalSnapshot } from '../../src/types';

vi.mock('@sentry-internal/rrweb', async () => {
  const mockRecordFn: Mock & Partial<RecordAdditionalProperties> = vi.fn(({ emit }) => {
    mockRecordFn._emitter = emit;

    emit(createCheckoutPayload());
    return function stop() {
      mockRecordFn._emitter = vi.fn();
    };
  });
  mockRecordFn.takeFullSnapshot = vi.fn((isCheckout: boolean) => {
    if (!mockRecordFn._emitter) {
      return;
    }

    mockRecordFn._emitter(createCheckoutPayload(isCheckout), isCheckout);
  });

  const ActualRrweb = await vi.importActual('@sentry-internal/rrweb');

  mockRecordFn.mirror = ActualRrweb.record.mirror;

  return {
    ...ActualRrweb,
    record: mockRecordFn,
  };
});

type RecordAdditionalProperties = {
  takeFullSnapshot: Mock;

  // Below are not mocked
  addCustomEvent: () => void;
  freezePage: () => void;
  mirror: unknown;

  // Custom property to fire events in tests, does not exist in rrweb.record
  _emitter: (event: RecordingEvent, ...args: any[]) => void;
};

export type RecordMock = MockedFunction<typeof record> & RecordAdditionalProperties;

function createCheckoutPayload(isCheckout: boolean = true): ReplayEventWithTime {
  return {
    data: { isCheckout },
    timestamp: Date.now(),
    type: isCheckout ? ReplayEventTypeFullSnapshot : ReplayEventTypeIncrementalSnapshot,
  };
}

export function mockRrweb(): { record: RecordMock } {
  return {
    record: record as RecordMock,
  };
}
