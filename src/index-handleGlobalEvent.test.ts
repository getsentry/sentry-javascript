// mock functions need to be imported first
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import type { RecordMock } from '@test';
import { BASE_TIMESTAMP } from '@test';
import { Error } from '@test/fixtures/error';
import { Transaction } from '@test/fixtures/transaction';

import { REPLAY_EVENT_NAME } from './session/constants';
import { ReplayConfiguration } from './types';
import { Replay } from './';

jest.useFakeTimers({ advanceTimers: true });

let replay: Replay;
let mockRecord: RecordMock;

async function getMockReplay(options: ReplayConfiguration = {}) {
  const { mockSdk } = await import('../test/mocks/mockSdk');
  const { replay } = await mockSdk({
    replayOptions: {
      errorSampleRate: 1.0,
      sessionSampleRate: 0.0,
      stickySession: false,
      ...options,
    },
  });

  return replay;
}
async function resetMocks() {
  jest.setSystemTime(new Date(BASE_TIMESTAMP));
  jest.clearAllMocks();
  jest.resetModules();
  // NOTE: The listeners added to `addInstrumentationHandler` are leaking
  // @ts-expect-error Don't know if there's a cleaner way to clean up old event processors
  globalThis.__SENTRY__.globalEventProcessors = [];
  const { mockRrweb } = await import('../test/mocks/mockRrweb');
  ({ record: mockRecord } = mockRrweb());
  mockRecord.takeFullSnapshot.mockClear();
}
beforeEach(async () => {
  await resetMocks();
  replay = await getMockReplay();
  jest.runAllTimers();
});

afterEach(() => {
  replay.stop();
});

it('deletes breadcrumbs from replay events', () => {
  const replayEvent = {
    type: REPLAY_EVENT_NAME,
    breadcrumbs: [{ type: 'fakecrumb' }],
  };

  // @ts-expect-error replay event type
  expect(replay.handleGlobalEvent(replayEvent)).toEqual({
    type: REPLAY_EVENT_NAME,
  });
});

it('does not delete breadcrumbs from error and transaction events', () => {
  expect(
    replay.handleGlobalEvent({
      breadcrumbs: [{ type: 'fakecrumb' }],
    })
  ).toEqual(
    expect.objectContaining({
      breadcrumbs: [{ type: 'fakecrumb' }],
    })
  );
  expect(
    replay.handleGlobalEvent({
      type: 'transaction',
      breadcrumbs: [{ type: 'fakecrumb' }],
    })
  ).toEqual(
    expect.objectContaining({
      breadcrumbs: [{ type: 'fakecrumb' }],
    })
  );
});

it('only tags errors with replay id, adds trace and error id to context for error samples', async () => {
  const transaction = Transaction();
  const error = Error();
  // @ts-expect-error idc
  expect(replay.handleGlobalEvent(transaction)).toEqual(
    expect.objectContaining({
      tags: expect.not.objectContaining({ replayId: expect.anything() }),
    })
  );
  expect(replay.handleGlobalEvent(error)).toEqual(
    expect.objectContaining({
      tags: expect.objectContaining({ replayId: expect.any(String) }),
    })
  );

  // @ts-expect-error private
  expect(replay.context.traceIds).toContain('trace_id');
  // @ts-expect-error private
  expect(replay.context.errorIds).toContain('event_id');

  jest.runAllTimers();
  await new Promise(process.nextTick); // wait for flush

  // Turns off `waitForError` mode
  // @ts-expect-error private
  expect(replay.waitForError).toBe(false);
});

it('tags errors and transactions with replay id for session samples', async () => {
  await resetMocks();
  replay = await getMockReplay({
    sessionSampleRate: 1.0,
    errorSampleRate: 0,
  });
  replay.start();
  const transaction = Transaction();
  const error = Error();
  // @ts-expect-error idc
  expect(replay.handleGlobalEvent(transaction)).toEqual(
    expect.objectContaining({
      tags: expect.objectContaining({ replayId: expect.any(String) }),
    })
  );
  expect(replay.handleGlobalEvent(error)).toEqual(
    expect.objectContaining({
      tags: expect.objectContaining({ replayId: expect.any(String) }),
    })
  );
});
