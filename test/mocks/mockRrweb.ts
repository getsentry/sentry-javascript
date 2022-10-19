import { jest } from '@jest/globals';

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

export type RecordMock = jest.MockedFunction<typeof rrweb.record> &
  RecordAdditionalProperties;

jest.mock('rrweb', () => {
  const ActualRrweb = jest.requireActual('rrweb');
  const mockRecordFn: jest.Mock & Partial<RecordAdditionalProperties> = jest.fn(
    ({ emit }) => {
      mockRecordFn._emitter = emit;
    }
  );
  mockRecordFn.takeFullSnapshot = jest.fn((isCheckout) => {
    if (!mockRecordFn._emitter) {
      return;
    }

    mockRecordFn._emitter(
      {
        data: { isCheckout },
        timestamp: new Date().getTime(),
        type: isCheckout ? 2 : 3,
      },
      isCheckout
    );
  });

  return {
    // @ts-expect-error spreading actual rrweb library
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
