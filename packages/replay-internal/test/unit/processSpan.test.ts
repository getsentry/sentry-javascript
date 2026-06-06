/**
 * @vitest-environment jsdom
 */

import type { StreamedSpanJSON } from '@sentry/core';
import { describe, expect, it, vi } from 'vitest';
import { Replay } from '../../src/integration';

function makeSpanJSON(overrides: Partial<StreamedSpanJSON> = {}): StreamedSpanJSON {
  return {
    name: 'test-span',
    span_id: 'abc123',
    trace_id: 'def456',
    start_timestamp: 0,
    end_timestamp: 1,
    status: 'ok',
    is_segment: false,
    attributes: {},
    ...overrides,
  };
}

const replay = new Replay();

describe('Replay.processSpan', () => {
  it('sets sentry.replay_id when replay is active', () => {
    vi.spyOn(replay, 'getReplayId').mockReturnValue('abc123sessionid');
    vi.spyOn(replay, 'getRecordingMode').mockReturnValue('session');

    const span = makeSpanJSON();
    replay.processSpan(span);

    expect(span.attributes).toEqual(expect.objectContaining({ 'sentry.replay_id': 'abc123sessionid' }));
    expect(span.attributes).not.toHaveProperty('sentry._internal.replay_is_buffering');

    vi.restoreAllMocks();
  });

  it('sets replay_is_buffering when recording mode is buffer', () => {
    vi.spyOn(replay, 'getReplayId').mockReturnValue('abc123sessionid');
    vi.spyOn(replay, 'getRecordingMode').mockReturnValue('buffer');

    const span = makeSpanJSON();
    replay.processSpan(span);

    expect(span.attributes).toEqual(
      expect.objectContaining({
        'sentry.replay_id': 'abc123sessionid',
        'sentry._internal.replay_is_buffering': true,
      }),
    );

    vi.restoreAllMocks();
  });

  it('does not set sentry.replay_id when replay is not active', () => {
    vi.spyOn(replay, 'getReplayId').mockReturnValue(undefined);

    const span = makeSpanJSON();
    replay.processSpan(span);

    expect(span.attributes).not.toHaveProperty('sentry.replay_id');
    expect(span.attributes).not.toHaveProperty('sentry._internal.replay_is_buffering');

    vi.restoreAllMocks();
  });

  it('does not overwrite an existing sentry.replay_id attribute', () => {
    vi.spyOn(replay, 'getReplayId').mockReturnValue('new-id');
    vi.spyOn(replay, 'getRecordingMode').mockReturnValue('session');

    const span = makeSpanJSON({ attributes: { 'sentry.replay_id': 'existing-id' } });
    replay.processSpan(span);

    expect(span.attributes!['sentry.replay_id']).toBe('existing-id');

    vi.restoreAllMocks();
  });
});
