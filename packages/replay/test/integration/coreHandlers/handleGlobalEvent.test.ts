import type { Event } from '@sentry/types';

import { REPLAY_EVENT_NAME, SESSION_IDLE_EXPIRE_DURATION } from '../../../src/constants';
import { handleGlobalEventListener } from '../../../src/coreHandlers/handleGlobalEvent';
import type { ReplayContainer } from '../../../src/replay';
import { makeSession } from '../../../src/session/Session';
import { Error } from '../../fixtures/error';
import { Transaction } from '../../fixtures/transaction';
import { resetSdkMock } from '../../mocks/resetSdkMock';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();
let replay: ReplayContainer;

describe('Integration | coreHandlers | handleGlobalEvent', () => {
  beforeEach(async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
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

    // @ts-expect-error replay event type
    expect(handleGlobalEventListener(replay)(replayEvent, {})).toEqual({
      type: REPLAY_EVENT_NAME,
    });
  });

  it('does not delete breadcrumbs from error and transaction events', () => {
    expect(
      handleGlobalEventListener(replay)(
        {
          breadcrumbs: [{ type: 'fakecrumb' }],
        },
        {},
      ),
    ).toEqual(
      expect.objectContaining({
        breadcrumbs: [{ type: 'fakecrumb' }],
      }),
    );
    expect(
      handleGlobalEventListener(replay)(
        {
          type: 'transaction',
          breadcrumbs: [{ type: 'fakecrumb' }],
        },
        {},
      ),
    ).toEqual(
      expect.objectContaining({
        breadcrumbs: [{ type: 'fakecrumb' }],
      }),
    );
  });

  it('does not add replayId for transactions in error mode', async () => {
    const transaction = Transaction();
    const error = Error();
    expect(handleGlobalEventListener(replay)(transaction, {})).toEqual(
      expect.not.objectContaining({
        // no tags at all here by default
        tags: expect.anything(),
      }),
    );
    expect(handleGlobalEventListener(replay)(error, {})).toEqual(
      expect.objectContaining({
        tags: expect.objectContaining({ replayId: expect.any(String) }),
      }),
    );
  });

  it('does not add replayId if replay is not enabled', async () => {
    const transaction = Transaction();
    const error = Error();

    replay['_isEnabled'] = false;

    expect(handleGlobalEventListener(replay)(transaction, {})).toEqual(
      expect.not.objectContaining({
        // no tags at all here by default
        tags: expect.anything(),
      }),
    );
    expect(handleGlobalEventListener(replay)(error, {})).toEqual(
      expect.objectContaining({
        tags: expect.not.objectContaining({ replayId: expect.anything() }),
      }),
    );
  });

  it('does not add replayId if replay session is expired', async () => {
    const transaction = Transaction();
    const error = Error();

    const now = Date.now();

    replay.session = makeSession({
      id: 'test-session-id',
      segmentId: 0,
      lastActivity: now - SESSION_IDLE_EXPIRE_DURATION - 1,
      started: now - SESSION_IDLE_EXPIRE_DURATION - 1,
      sampled: 'session',
    });

    expect(handleGlobalEventListener(replay)(transaction, {})).toEqual(
      expect.not.objectContaining({
        // no tags at all here by default
        tags: expect.anything(),
      }),
    );
    expect(handleGlobalEventListener(replay)(error, {})).toEqual(
      expect.objectContaining({
        tags: expect.not.objectContaining({ replayId: expect.anything() }),
      }),
    );
  });

  it('tags errors and transactions with replay id for session samples', async () => {
    const { replay, integration } = await resetSdkMock({});
    // @ts-expect-error protected but ok to use for testing
    integration._initialize();
    const transaction = Transaction();
    const error = Error();
    expect(handleGlobalEventListener(replay)(transaction, {})).toEqual(
      expect.objectContaining({
        tags: expect.objectContaining({ replayId: expect.any(String) }),
      }),
    );
    expect(handleGlobalEventListener(replay)(error, {})).toEqual(
      expect.objectContaining({
        tags: expect.objectContaining({ replayId: expect.any(String) }),
      }),
    );
  });

  it('does not collect errorIds', async () => {
    const error1 = Error({ event_id: 'err1' });
    const error2 = Error({ event_id: 'err2' });
    const error3 = Error({ event_id: 'err3' });

    const handler = handleGlobalEventListener(replay);

    handler(error1, {});
    handler(error2, {});
    handler(error3, {});

    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
  });

  it('does not collect traceIds', async () => {
    const transaction1 = Transaction('tr1');
    const transaction2 = Transaction('tr2');
    const transaction3 = Transaction('tr3');

    const handler = handleGlobalEventListener(replay);

    handler(transaction1, {});
    handler(transaction2, {});
    handler(transaction3, {});

    expect(Array.from(replay.getContext().traceIds)).toEqual([]);
  });

  it('ignores profile & replay events', async () => {
    const profileEvent: Event = { type: 'profile' };
    const replayEvent: Event = { type: 'replay_event' };

    const handler = handleGlobalEventListener(replay);

    expect(replay.recordingMode).toBe('buffer');

    handler(profileEvent, {});
    handler(replayEvent, {});

    expect(Array.from(replay.getContext().traceIds)).toEqual([]);
    expect(Array.from(replay.getContext().errorIds)).toEqual([]);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');
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

    expect(handleGlobalEventListener(replay)(errorEvent, {})).toEqual(errorEvent);
  });

  it('skips exception with __rrweb__ set', () => {
    const errorEvent: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'contains')",
            stacktrace: {
              frames: [
                {
                  filename: 'scrambled.js',
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

    const originalException = new window.Error('some exception');
    // @ts-expect-error this could be set by rrweb
    originalException.__rrweb__ = true;

    expect(handleGlobalEventListener(replay)(errorEvent, { originalException })).toEqual(null);
  });

  it('handles string exceptions', () => {
    const errorEvent: Event = {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: "Cannot read properties of undefined (reading 'contains')",
            stacktrace: {
              frames: [
                {
                  filename: 'scrambled.js',
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

    const originalException = 'some string exception';

    expect(handleGlobalEventListener(replay)(errorEvent, { originalException })).toEqual(errorEvent);
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

    expect(handleGlobalEventListener(replay)(errorEvent, {})).toEqual(errorEvent);
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

    expect(handleGlobalEventListener(replay)(errorEvent, {})).toEqual(errorEvent);
  });

  it('does not skip non-rrweb errors when no exception', () => {
    const errorEvent: Event = {
      exception: undefined,
      level: 'error',
      event_id: 'ff1616b1e13744c6964281349aecc82a',
    };

    expect(handleGlobalEventListener(replay)(errorEvent, {})).toEqual(errorEvent);
  });
});
