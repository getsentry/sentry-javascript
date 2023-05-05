import { getCurrentHub } from '@sentry/core';
import type { ErrorEvent, Event } from '@sentry/types';

import { UNABLE_TO_SEND_REPLAY } from '../../../src/constants';
import { handleAfterSendEvent } from '../../../src/coreHandlers/handleAfterSendEvent';
import type { ReplayContainer } from '../../../src/replay';
import { Error } from '../../fixtures/error';
import { Transaction } from '../../fixtures/transaction';
import { resetSdkMock } from '../../mocks/resetSdkMock';
import { useFakeTimers } from '../../utils/use-fake-timers';

useFakeTimers();
let replay: ReplayContainer;

describe('Integration | coreHandlers | handleAfterSendEvent', () => {
  afterEach(() => {
    replay.stop();
  });

  it('records errorIds from sent error events', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const error1 = Error({ event_id: 'err1' });
    const error2 = Error({ event_id: 'err2' });
    const error3 = Error({ event_id: 'err3' });
    const error4 = Error({ event_id: 'err4' });

    const handler = handleAfterSendEvent(replay);

    // With undefined response: Don't capture
    handler(error1, undefined);
    // With "successful" response: Capture
    handler(error2, { statusCode: 200 });
    // With "unsuccessful" response: Don't capture
    handler(error3, { statusCode: 0 });
    // With no statusCode response: Don't Capture
    handler(error4, { statusCode: undefined });

    expect(Array.from(replay.getContext().errorIds)).toEqual(['err2']);
    expect(Array.from(replay.getContext().traceIds)).toEqual([]);
  });

  it('records traceIds from sent transaction events', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const transaction1 = Transaction('tr1');
    const transaction2 = Transaction('tr2');
    const transaction3 = Transaction('tr3');
    const transaction4 = Transaction('tr4');

    const handler = handleAfterSendEvent(replay);

    // With undefined response: Don't capture
    handler(transaction1, undefined);
    // With "successful" response: Capture
    handler(transaction2, { statusCode: 200 });
    // With "unsuccessful" response: Don't capture
    handler(transaction3, { statusCode: 0 });
    // With no statusCode response: Don't Capture
    handler(transaction4, { statusCode: undefined });

    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
    expect(Array.from(replay.getContext().traceIds)).toEqual(['tr2']);

    // Does not affect error session
    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
    expect(Array.from(replay.getContext().traceIds)).toEqual(['tr2']);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');
  });

  it('allows undefined send response when using custom transport', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const client = getCurrentHub().getClient()!;
    // @ts-ignore make sure to remove this
    delete client.getTransport()!.send.__sentry__baseTransport__;

    const error1 = Error({ event_id: 'err1' });
    const error2 = Error({ event_id: 'err2' });
    const error3 = Error({ event_id: 'err3' });
    const error4 = Error({ event_id: 'err4' });

    const handler = handleAfterSendEvent(replay);

    // With undefined response: Capture
    handler(error1, undefined);
    // With "successful" response: Capture
    handler(error2, { statusCode: 200 });
    // With "unsuccessful" response: Capture
    handler(error3, { statusCode: 0 });
    // With no statusCode response: Capture
    handler(error4, { statusCode: undefined });

    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1', 'err2', 'err3', 'err4']);
  });

  it('flushes when in error mode', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const mockSend = getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>;

    const error1 = Error({ event_id: 'err1', replayId: 'replayid1' });

    const handler = handleAfterSendEvent(replay);

    expect(replay.recordingMode).toBe('buffer');

    handler(error1, { statusCode: 200 });

    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Send twice, one for the error & one right after for the session conversion
    expect(mockSend).toHaveBeenCalledTimes(2);
    // This is removed now, because it has been converted to a "session" session
    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('session');
  });

  it('does not flush when in session mode', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 1.0,
        replaysOnErrorSampleRate: 0.0,
      },
    }));

    const mockSend = getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>;

    const error1 = Error({ event_id: 'err1' });

    const handler = handleAfterSendEvent(replay);

    expect(replay.recordingMode).toBe('session');

    handler(error1, { statusCode: 200 });

    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Send once for the regular session sending
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('session');
  });

  it('ignores profile & replay events', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const mockSend = getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>;

    const profileEvent: Event = { type: 'profile' };
    const replayEvent: Event = { type: 'replay_event' };

    const handler = handleAfterSendEvent(replay);

    expect(replay.recordingMode).toBe('buffer');

    handler(profileEvent, { statusCode: 200 });
    handler(replayEvent, { statusCode: 200 });

    expect(Array.from(replay.getContext().errorIds)).toEqual([]);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    expect(mockSend).toHaveBeenCalledTimes(0);
    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');
  });

  it('does not flush in error mode when failing to send the error', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const mockSend = getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>;

    const error1 = Error({ event_id: 'err1' });

    const handler = handleAfterSendEvent(replay);

    expect(replay.recordingMode).toBe('buffer');

    handler(error1, undefined);

    expect(Array.from(replay.getContext().errorIds)).toEqual([]);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Remains in error mode & without flushing
    expect(mockSend).toHaveBeenCalledTimes(0);
    expect(Array.from(replay.getContext().errorIds)).toEqual([]);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');
  });

  it('does not flush if error event has no exception', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const mockSend = getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>;

    const error1: ErrorEvent = { event_id: 'err1', type: undefined };

    const handler = handleAfterSendEvent(replay);

    expect(replay.recordingMode).toBe('buffer');

    handler(error1, { statusCode: 200 });

    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Remains in error mode & without flushing
    expect(mockSend).toHaveBeenCalledTimes(0);
    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');
  });

  it('does not flush if error is replay send error', async () => {
    ({ replay } = await resetSdkMock({
      replayOptions: {
        stickySession: false,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    const mockSend = getCurrentHub().getClient()!.getTransport()!.send as unknown as jest.SpyInstance<any>;

    const error1 = Error({ event_id: 'err1', message: UNABLE_TO_SEND_REPLAY });

    const handler = handleAfterSendEvent(replay);

    expect(replay.recordingMode).toBe('buffer');

    handler(error1, { statusCode: 200 });

    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);

    jest.runAllTimers();
    await new Promise(process.nextTick);

    // Remains in error mode & without flushing
    expect(mockSend).toHaveBeenCalledTimes(0);
    expect(Array.from(replay.getContext().errorIds)).toEqual(['err1']);
    expect(replay.isEnabled()).toBe(true);
    expect(replay.isPaused()).toBe(false);
    expect(replay.recordingMode).toBe('buffer');
  });
});
