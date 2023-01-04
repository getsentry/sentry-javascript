import { getCurrentHub } from '@sentry/core';
import { Event } from '@sentry/types';

import { REPLAY_EVENT_NAME } from '../../../src/constants';
import { handleGlobalEventListener } from '../../../src/coreHandlers/handleGlobalEvent';
import { ReplayContainer } from '../../../src/replay';
import {
  overwriteRecordDroppedEvent,
  restoreRecordDroppedEvent,
} from '../../../src/util/monkeyPatchRecordDroppedEvent';
import { Error } from '../../fixtures/error';
import { Transaction } from '../../fixtures/transaction';
import { resetSdkMock } from '../../mocks/resetSdkMock';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();
let replay: ReplayContainer;

describe('handleGlobalEvent', () => {
  beforeEach(async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
      autoStart: false,
    }));
  });

  afterEach(() => {
    replay.stop();
  });

  it('deletes breadcrumbs from replay events', () => {
    const replayEvent = {
      type: REPLAY_EVENT_NAME,
      breadcrumbs: [{ type: 'fakecrumb' }],
    };

    // @ts-ignore replay event type
    expect(handleGlobalEventListener(replay)(replayEvent)).toEqual({
      type: REPLAY_EVENT_NAME,
    });
  });

  it('does not delete breadcrumbs from error and transaction events', () => {
    expect(
      handleGlobalEventListener(replay)({
        breadcrumbs: [{ type: 'fakecrumb' }],
      }),
    ).toEqual(
      expect.objectContaining({
        breadcrumbs: [{ type: 'fakecrumb' }],
      }),
    );
    expect(
      handleGlobalEventListener(replay)({
        type: 'transaction',
        breadcrumbs: [{ type: 'fakecrumb' }],
      }),
    ).toEqual(
      expect.objectContaining({
        breadcrumbs: [{ type: 'fakecrumb' }],
      }),
    );
  });

  it('only tags errors with replay id, adds trace and error id to context for error samples', async () => {
    const transaction = Transaction();
    const error = Error();
    // @ts-ignore idc
    expect(handleGlobalEventListener(replay)(transaction)).toEqual(
      expect.objectContaining({
        tags: expect.not.objectContaining({ replayId: expect.anything() }),
      }),
    );
    expect(handleGlobalEventListener(replay)(error)).toEqual(
      expect.objectContaining({
        tags: expect.objectContaining({ replayId: expect.any(String) }),
      }),
    );

    expect(replay.getContext().traceIds).toContain('trace_id');
    expect(replay.getContext().errorIds).toContain('event_id');

    jest.runAllTimers();
    await new Promise(process.nextTick); // wait for flush

    // Rerverts `recordingMode` to session
    expect(replay.recordingMode).toBe('session');
  });

  it('strips out dropped events from errorIds', async () => {
    const error1 = Error({ event_id: 'err1' });
    const error2 = Error({ event_id: 'err2' });
    const error3 = Error({ event_id: 'err3' });

    // @ts-ignore private
    overwriteRecordDroppedEvent(replay.getContext().errorIds);

    const client = getCurrentHub().getClient()!;

    handleGlobalEventListener(replay)(error1);
    handleGlobalEventListener(replay)(error2);
    handleGlobalEventListener(replay)(error3);

    client.recordDroppedEvent('before_send', 'error', { event_id: 'err2' });

    // @ts-ignore private
    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1', 'err3']);

    restoreRecordDroppedEvent();
  });

  it('tags errors and transactions with replay id for session samples', async () => {
    ({ replay } = await resetSdkMock({}));
    replay.start();
    const transaction = Transaction();
    const error = Error();
    // @ts-ignore idc
    expect(handleGlobalEventListener(replay)(transaction)).toEqual(
      expect.objectContaining({
        tags: expect.objectContaining({ replayId: expect.any(String) }),
      }),
    );
    expect(handleGlobalEventListener(replay)(error)).toEqual(
      expect.objectContaining({
        tags: expect.objectContaining({ replayId: expect.any(String) }),
      }),
    );
  });

  it('does not skip non-rrweb errors', () => {
    const errorEvent: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'contains')",
            stacktrace: {
              frames: [
                {
                  filename: 'http://example.com/..node_modules/packages/replay/build/npm/some-other-file.js',
                  function: 'MutationBuffer.processMutations',
                  in_app: true,
                  lineno: 101,
                  colno: 23,
                },
                {
                  filename: '<anonymous>',
                  function: 'Array.forEach',
                  in_app: true,
                },
              ],
            },
            mechanism: {
              type: 'generic',
              handled: true,
            },
          },
        ],
      },
      level: 'error',
      event_id: 'ff1616b1e13744c6964281349aecc82a',
    };

    expect(handleGlobalEventListener(replay)(errorEvent)).toEqual(errorEvent);
  });

  it('skips rrweb internal errors', () => {
    const errorEvent: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'contains')",
            stacktrace: {
              frames: [
                {
                  filename:
                    'http://example.com/..node_modules/packages/replay/build/npm/esm/node_modules/rrweb/es/rrweb/packages/rrweb/src/record/mutation.js?v=90704e8a',
                  function: 'MutationBuffer.processMutations',
                  in_app: true,
                  lineno: 101,
                  colno: 23,
                },
                {
                  filename: '<anonymous>',
                  function: 'Array.forEach',
                  in_app: true,
                },
              ],
            },
            mechanism: {
              type: 'generic',
              handled: true,
            },
          },
        ],
      },
      level: 'error',
      event_id: 'ff1616b1e13744c6964281349aecc82a',
    };

    expect(handleGlobalEventListener(replay)(errorEvent)).toEqual(null);
  });

  it('does not skip rrweb internal errors with _experiments.captureExceptions', () => {
    const errorEvent: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'contains')",
            stacktrace: {
              frames: [
                {
                  filename:
                    'http://example.com/..node_modules/packages/replay/build/npm/esm/node_modules/rrweb/es/rrweb/packages/rrweb/src/record/mutation.js?v=90704e8a',
                  function: 'MutationBuffer.processMutations',
                  in_app: true,
                  lineno: 101,
                  colno: 23,
                },
                {
                  filename: '<anonymous>',
                  function: 'Array.forEach',
                  in_app: true,
                },
              ],
            },
            mechanism: {
              type: 'generic',
              handled: true,
            },
          },
        ],
      },
      level: 'error',
      event_id: 'ff1616b1e13744c6964281349aecc82a',
    };

    replay.getOptions()._experiments = { captureExceptions: true };

    expect(handleGlobalEventListener(replay)(errorEvent)).toEqual(errorEvent);
  });

  it('does not skip non-rrweb errors when no stacktrace exists', () => {
    const errorEvent: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'contains')",
            stacktrace: {
              frames: [],
            },
            mechanism: {
              type: 'generic',
              handled: true,
            },
          },
        ],
      },
      level: 'error',
      event_id: 'ff1616b1e13744c6964281349aecc82a',
    };

    expect(handleGlobalEventListener(replay)(errorEvent)).toEqual(errorEvent);
  });

  it('does not skip non-rrweb errors when no exception', () => {
    const errorEvent: Event = {
      exception: undefined,
      level: 'error',
      event_id: 'ff1616b1e13744c6964281349aecc82a',
    };

    expect(handleGlobalEventListener(replay)(errorEvent)).toEqual(errorEvent);
  });
});
