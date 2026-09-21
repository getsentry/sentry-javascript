/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { FeedbackEvent } from '@sentry/core';
import { getClient } from '@sentry/core';
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
    const feedbackEvent = createFeedbackEvent('widget');

    getClient()!.emit('beforeSendFeedback', feedbackEvent, { includeReplay: true });

    expect(replay.getSessionId()).not.toBe(replayIdOnOpen);
    expect(feedbackEvent.contexts?.feedback?.replay_id).toBe(replayIdOnOpen);
  });

  it('attaches the current replay ID when feedback is sent via the API after the widget was opened', async () => {
    await openFeedbackWidget();
    await expireSession();
    const feedbackEvent = createFeedbackEvent('api');

    getClient()!.emit('beforeSendFeedback', feedbackEvent, { includeReplay: true });
    await advanceTimers(DEFAULT_FLUSH_MIN_DELAY);

    expect(feedbackEvent.contexts?.feedback?.replay_id).toBe(replay.getSessionId());
  });

  it('does not attach a replay ID when includeReplay is not set', async () => {
    await openFeedbackWidget();
    const feedbackEvent = createFeedbackEvent('widget');

    getClient()!.emit('beforeSendFeedback', feedbackEvent);

    expect(feedbackEvent.contexts?.feedback?.replay_id).toBeUndefined();
  });
});
