/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import type { ReplayEndEvent, ReplayStartEvent } from '@sentry/core';
import { getClient } from '@sentry/core';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Replay } from '../../src/integration';
import type { ReplayContainer } from '../../src/replay';
import { BASE_TIMESTAMP } from '../index';
import { resetSdkMock } from '../mocks/resetSdkMock';

describe('Integration | lifecycle hooks', () => {
  let replay: ReplayContainer;
  let integration: Replay;
  let startEvents: ReplayStartEvent[];
  let endEvents: ReplayEndEvent[];
  let unsubscribes: Array<() => void>;

  beforeAll(() => {
    vi.useFakeTimers();
  });

  beforeEach(async () => {
    ({ replay, integration } = await resetSdkMock({
      replayOptions: { stickySession: false },
      sentryOptions: { replaysSessionSampleRate: 0.0 },
      autoStart: false,
    }));

    startEvents = [];
    endEvents = [];
    const client = getClient()!;
    unsubscribes = [
      client.on('replayStart', event => startEvents.push(event)),
      client.on('replayEnd', event => endEvents.push(event)),
    ];

    await vi.runAllTimersAsync();
  });

  afterEach(async () => {
    unsubscribes.forEach(off => off());
    await integration.stop();
    await vi.runAllTimersAsync();
    vi.setSystemTime(new Date(BASE_TIMESTAMP));
  });

  it('fires replayStart with session mode when start() is called', () => {
    integration.start();

    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]).toEqual({
      sessionId: expect.any(String),
      recordingMode: 'session',
    });
    expect(startEvents[0]!.sessionId).toBe(replay.session!.id);
  });

  it('fires replayStart with buffer mode when startBuffering() is called', () => {
    integration.startBuffering();

    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]).toEqual({
      sessionId: expect.any(String),
      recordingMode: 'buffer',
    });
  });

  it('fires replayEnd with reason "manual" when integration.stop() is called', async () => {
    integration.start();
    const sessionId = replay.session!.id;

    await integration.stop();

    expect(endEvents).toHaveLength(1);
    expect(endEvents[0]).toEqual({ sessionId, reason: 'manual' });
  });

  it('forwards the internal stop reason to replayEnd subscribers', async () => {
    integration.start();
    const sessionId = replay.session!.id;

    await replay.stop({ reason: 'mutationLimit' });

    expect(endEvents).toHaveLength(1);
    expect(endEvents[0]).toEqual({ sessionId, reason: 'mutationLimit' });
  });

  it('does not fire replayEnd twice when stop() is called while already stopped', async () => {
    integration.start();

    await replay.stop({ reason: 'sendError' });
    await replay.stop({ reason: 'sendError' });

    expect(endEvents).toHaveLength(1);
    expect(endEvents[0]!.reason).toBe('sendError');
  });

  it('stops invoking callbacks after the returned unsubscribe is called', () => {
    const [offStart] = unsubscribes;
    offStart!();

    integration.start();

    expect(startEvents).toHaveLength(0);
  });
});
