import { RecordingEvent } from '../../src/types';

type RecordAdditionalProperties = {
  takeFullSnapshot: jest.Mock;

  // Below are not mocked
  addCustomEvent: () => void;
  freezePage: () => void;
  mirror: unknown;

  // Custom property to fire events in tests, does not exist in rrweb.record
  _emitter: (event: RecordingEvent, ...args: any[]) => void;
};

export type RecordMock = jest.MockedFunction<typeof rrweb.record> & RecordAdditionalProperties;

function createCheckoutPayload(isCheckout: boolean = true) {
  return {
    data: { isCheckout },
    timestamp: new Date().getTime(),
    type: isCheckout ? 2 : 3,
  };
}

jest.mock('rrweb', () => {
  const ActualRrweb = jest.requireActual('rrweb');
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

  return {
    ...ActualRrweb,
    record: mockRecordFn,
  };
});

// XXX: Intended to be after `mock('rrweb')`
import * as rrweb from 'rrweb';

export function mockRrweb() {
  return {
    record: rrweb.record as RecordMock,
  };
}
