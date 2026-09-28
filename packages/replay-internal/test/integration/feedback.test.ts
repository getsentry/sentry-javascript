/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { Event, FeedbackEvent } from '@sentry/core';
import { captureFeedback, getClient } from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FLUSH_MIN_DELAY, SESSION_IDLE_EXPIRE_DURATION } from '../../src/constants';
import type { ReplayContainer } from '../../src/replay';
import { clearSession } from '../../src/session/clearSession';
import { BASE_TIMESTAMP } from '../index';
import type { RecordMock } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';
import type { DomHandler } from '../types';
import { getTestEventIncremental } from '../utils/getTestEvent';

async function advanceTimers(time: number) {
  vi.advanceTimersByTime(time);
  await new Promise(process.nextTick);
}

function createFeedbackEvent(source: string): FeedbackEvent {
  return {
    type: 'feedback',
    contexts: {
      feedback: {
        message: 'Something broke',
        source,
      },
    },
  };
}

describe('Integration | feedback', () => {
  let replay: ReplayContainer;
  let mockRecord: RecordMock;
  let domHandler: DomHandler;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(async () => {
    ({ mockRecord, domHandler, replay } = await resetSdkMock({
      replayOptions: {
        stickySession: true,
      },
      sentryOptions: {
        replaysSessionSampleRate: 0.0,
        replaysOnErrorSampleRate: 1.0,
      },
    }));

    mockRecord._emitter(getTestEventIncremental({ timestamp: BASE_TIMESTAMP }));
    await advanceTimers(10_000);
  });

  afterEach(() => {
    clearSession(replay);
    replay.stop();
  });

  async function openFeedbackWidget() {
    getClient()!.emit('openFeedbackWidget');
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
  }

  async function sendFeedback(source: string): Promise<Event | undefined> {
    let sentEvent: Event | undefined;
    const unsubscribe = getClient()!.on('beforeSendEvent', event => {
      if (event.type === 'feedback') {
        sentEvent = event;
      }
    });

    captureFeedback({ message: 'Something broke', source }, { includeReplay: true });
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
    unsubscribe();

    return sentEvent;
  }

  async function expireSession() {
    await advanceTimers(SESSION_IDLE_EXPIRE_DURATION + 1_000);
    domHandler({ name: 'click', event: new Event('click') });
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);
  }

  it('sends the buffered replay and continues in session mode when the widget is opened', async () => {
    await openFeedbackWidget();

    expect(replay).toHaveLastSentReplay();
    expect(replay.recordingMode).toBe('session');
  });

  it('attaches the replay ID from when the widget was opened when the session is refreshed before submission', async () => {
    await openFeedbackWidget();
    const replayIdOnOpen = replay.getSessionId();
    await expireSession();

    const sentEvent = await sendFeedback('widget');

    expect(replay.getSessionId()).not.toBe(replayIdOnOpen);
    expect(sentEvent?.contexts?.feedback?.replay_id).toBe(replayIdOnOpen);
  });

  it('does not flush the refreshed session when widget feedback is sent after a session refresh', async () => {
    await openFeedbackWidget();
    await expireSession();
    const flushSpy = vi.spyOn(replay, 'flush');

    await sendFeedback('widget');

    expect(flushSpy).not.toHaveBeenCalled();
  });

  it('attaches the replay ID from when the widget was opened when replay is stopped before submission', async () => {
    await openFeedbackWidget();
    const replayIdOnOpen = replay.getSessionId();
    replay.stop();

    const sentEvent = await sendFeedback('widget');

    expect(sentEvent?.contexts?.feedback?.replay_id).toBe(replayIdOnOpen);
  });

  it('attaches the current replay ID when widget feedback is sent again without reopening the widget', async () => {
    await openFeedbackWidget();
    await expireSession();
    await sendFeedback('widget');

    const sentEvent = await sendFeedback('widget');

    expect(sentEvent?.contexts?.feedback?.replay_id).toBe(replay.getSessionId());
  });

  it('attaches the current replay ID when the widget was opened while replay was disabled', async () => {
    replay.stop();
    await openFeedbackWidget();
    replay.start();

    const sentEvent = await sendFeedback('widget');

    expect(replay.getSessionId()).toBeDefined();
    expect(sentEvent?.contexts?.feedback?.replay_id).toBe(replay.getSessionId());
  });

  it('attaches the current replay ID when feedback is sent via the API after the widget was opened', async () => {
    await openFeedbackWidget();
    await expireSession();

    const sentEvent = await sendFeedback('api');

    expect(sentEvent?.contexts?.feedback?.replay_id).toBe(replay.getSessionId());
  });

  it('does not attach a replay ID when includeReplay is not set', async () => {
    await openFeedbackWidget();
    const feedbackEvent = createFeedbackEvent('widget');

    getClient()!.emit('beforeSendFeedback', feedbackEvent);

    expect(feedbackEvent.contexts?.feedback?.replay_id).toBeUndefined();
  });
});
