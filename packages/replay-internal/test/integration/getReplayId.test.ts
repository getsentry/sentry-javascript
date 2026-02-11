/**
 * @vitest-environment jsdom
 */

import '../utils/mock-internal-setTimeout';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../mocks/mockSdk';

describe('Integration | getReplayId', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('works', async () => {
    const { integration, replay } = await mockSdk({
      replayOptions: {
        stickySession: true,
      },
    });

    expect(integration.getReplayId()).toBeDefined();
    expect(integration.getReplayId()).toEqual(replay.session?.id);

    // When stopped, it is undefined
    integration.stop();

    expect(integration.getReplayId()).toBeUndefined();
  });

  describe('onlyIfSampled parameter', () => {
    it('returns replay ID for session mode when onlyIfSampled=true', async () => {
      const { integration, replay } = await mockSdk({
        replayOptions: {
          stickySession: true,
        },
      });

      // Should be in session mode by default with sessionSampleRate: 1.0
      expect(replay.recordingMode).toBe('session');
      expect(replay.session?.sampled).toBe('session');

      expect(integration.getReplayId(true)).toBeDefined();
      expect(integration.getReplayId(true)).toEqual(replay.session?.id);
    });

    it('returns replay ID for buffer mode when onlyIfSampled=true', async () => {
      const { integration, replay } = await mockSdk({
        replayOptions: {
          stickySession: true,
        },
        sentryOptions: {
          replaysSessionSampleRate: 0.0,
          replaysOnErrorSampleRate: 1.0,
        },
      });

      // Force buffer mode by manually setting session
      if (replay.session) {
        replay.session.sampled = 'buffer';
        replay.recordingMode = 'buffer';
      }

      expect(integration.getReplayId(true)).toBeDefined();
      expect(integration.getReplayId(true)).toEqual(replay.session?.id);
    });

    it('returns undefined for unsampled sessions when onlyIfSampled=true', async () => {
      const { integration, replay } = await mockSdk({
        replayOptions: {
          stickySession: true,
        },
        sentryOptions: {
          replaysSessionSampleRate: 1.0, // Start enabled to create session
          replaysOnErrorSampleRate: 0.0,
        },
      });

      // Manually create an unsampled session by overriding the existing one
      replay.session = {
        id: 'test-unsampled-session',
        started: Date.now(),
        lastActivity: Date.now(),
        segmentId: 0,
        sampled: false,
      };

      expect(integration.getReplayId(true)).toBeUndefined();
      // But default behavior should still return the ID
      expect(integration.getReplayId()).toBe('test-unsampled-session');
      expect(integration.getReplayId(false)).toBe('test-unsampled-session');
    });

    it('maintains backward compatibility when onlyIfSampled is not provided', async () => {
      const { integration, replay } = await mockSdk({
        replayOptions: {
          stickySession: true,
        },
        sentryOptions: {
          replaysSessionSampleRate: 1.0, // Start with a session to ensure initialization
          replaysOnErrorSampleRate: 0.0,
        },
      });

      const testCases: Array<{ sampled: 'session' | 'buffer' | false; sessionId: string }> = [
        { sampled: 'session', sessionId: 'session-test-id' },
        { sampled: 'buffer', sessionId: 'buffer-test-id' },
        { sampled: false, sessionId: 'unsampled-test-id' },
      ];

      for (const { sampled, sessionId } of testCases) {
        replay.session = {
          id: sessionId,
          started: Date.now(),
          lastActivity: Date.now(),
          segmentId: 0,
          sampled,
        };

        // Default behavior should always return the ID
        expect(integration.getReplayId()).toBe(sessionId);
      }
    });

    it('returns undefined when replay is disabled regardless of onlyIfSampled', async () => {
      const { integration } = await mockSdk({
        replayOptions: {
          stickySession: true,
        },
      });

      integration.stop();

      expect(integration.getReplayId()).toBeUndefined();
      expect(integration.getReplayId(true)).toBeUndefined();
      expect(integration.getReplayId(false)).toBeUndefined();
    });
  });
});
