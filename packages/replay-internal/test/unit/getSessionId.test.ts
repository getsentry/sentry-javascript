/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import type { Session } from '../../src/types';
import { setupReplayContainer } from '../utils/setupReplayContainer';

describe('Unit | ReplayContainer | getSessionId', () => {
  it('returns session ID when session exists', () => {
    const replay = setupReplayContainer();
    const mockSession: Session = {
      id: 'test-session-id',
      started: Date.now(),
      lastActivity: Date.now(),
      segmentId: 0,
      sampled: 'session',
    };
    replay.session = mockSession;

    expect(replay.getSessionId()).toBe('test-session-id');
  });

  it('returns undefined when no session exists', () => {
    const replay = setupReplayContainer();
    replay.session = undefined;

    expect(replay.getSessionId()).toBeUndefined();
  });

  describe('onlyIfSampled parameter', () => {
    it('returns session ID for sampled=session when onlyIfSampled=true', () => {
      const replay = setupReplayContainer();
      const mockSession: Session = {
        id: 'test-session-id',
        started: Date.now(),
        lastActivity: Date.now(),
        segmentId: 0,
        sampled: 'session',
      };
      replay.session = mockSession;

      expect(replay.getSessionId(true)).toBe('test-session-id');
    });

    it('returns session ID for sampled=buffer when onlyIfSampled=true', () => {
      const replay = setupReplayContainer();
      const mockSession: Session = {
        id: 'test-session-id',
        started: Date.now(),
        lastActivity: Date.now(),
        segmentId: 0,
        sampled: 'buffer',
      };
      replay.session = mockSession;

      expect(replay.getSessionId(true)).toBe('test-session-id');
    });

    it('returns undefined for sampled=false when onlyIfSampled=true', () => {
      const replay = setupReplayContainer();
      const mockSession: Session = {
        id: 'test-session-id',
        started: Date.now(),
        lastActivity: Date.now(),
        segmentId: 0,
        sampled: false,
      };
      replay.session = mockSession;

      expect(replay.getSessionId(true)).toBeUndefined();
    });

    it('returns session ID for sampled=false when onlyIfSampled=false (default)', () => {
      const replay = setupReplayContainer();
      const mockSession: Session = {
        id: 'test-session-id',
        started: Date.now(),
        lastActivity: Date.now(),
        segmentId: 0,
        sampled: false,
      };
      replay.session = mockSession;

      expect(replay.getSessionId()).toBe('test-session-id');
      expect(replay.getSessionId(false)).toBe('test-session-id');
    });

    it('returns undefined when no session exists regardless of onlyIfSampled', () => {
      const replay = setupReplayContainer();
      replay.session = undefined;

      expect(replay.getSessionId(true)).toBeUndefined();
      expect(replay.getSessionId(false)).toBeUndefined();
    });
  });

  describe('backward compatibility', () => {
    it('maintains existing behavior when onlyIfSampled is not provided', () => {
      const replay = setupReplayContainer();

      // Test with different sampling states
      const testCases: Array<{ sampled: Session['sampled']; expected: string | undefined }> = [
        { sampled: 'session', expected: 'test-session-id' },
        { sampled: 'buffer', expected: 'test-session-id' },
        { sampled: false, expected: 'test-session-id' },
      ];

      testCases.forEach(({ sampled, expected }) => {
        const mockSession: Session = {
          id: 'test-session-id',
          started: Date.now(),
          lastActivity: Date.now(),
          segmentId: 0,
          sampled,
        };
        replay.session = mockSession;

        expect(replay.getSessionId()).toBe(expected);
      });
    });
  });
});
