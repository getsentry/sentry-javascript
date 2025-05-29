/**
 * @vitest-environment jsdom
 */

import type { Log } from '@sentry/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSdk } from '../index';

describe('Integration | logAttributes', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('log attributes with replay ID', () => {
    it('adds replay ID to log attributes when replay is enabled and has a session', async () => {
      const { replay, integration, client } = await mockSdk({
        replayOptions: {},
        sentryOptions: {
          _experiments: { enableLogs: true },
          replaysSessionSampleRate: 1.0,
        },
      });

      // Start replay to create a session
      replay.start();
      expect(replay.isEnabled()).toBe(true);
      expect(integration.getReplayId()).toBeDefined();

      const replayId = integration.getReplayId();

      // Mock the client and emit a log event
      const log: Log = {
        level: 'info',
        message: 'test log message',
        attributes: { 'existing.attr': 'value' },
      };

      client.emit('beforeCaptureLog', log);

      expect(log.attributes).toEqual({
        'existing.attr': 'value',
        'replay.id': replayId,
      });
    });

    it('preserves existing log attributes when adding replay ID', async () => {
      const { replay, integration, client } = await mockSdk({
        replayOptions: {},
        sentryOptions: {
          _experiments: { enableLogs: true },
          replaysSessionSampleRate: 1.0,
        },
      });

      // Start replay to create a session
      replay.start();
      const replayId = integration.getReplayId();

      const log: Log = {
        level: 'error',
        message: 'error log message',
        attributes: {
          'user.id': 'test-user',
          'request.id': 'req-123',
          module: 'auth',
        },
      };

      client.emit('beforeCaptureLog', log);

      expect(log.attributes).toEqual({
        'user.id': 'test-user',
        'request.id': 'req-123',
        module: 'auth',
        'replay.id': replayId,
      });
    });

    it('does not add replay ID when replay is not enabled', async () => {
      const { replay, client } = await mockSdk({
        replayOptions: {},
        sentryOptions: {
          _experiments: { enableLogs: true },
          replaysSessionSampleRate: 0.0, // Disabled
        },
      });

      // Replay should not be enabled
      expect(replay.isEnabled()).toBe(false);

      const log: Log = {
        level: 'info',
        message: 'test log message',
        attributes: { 'existing.attr': 'value' },
      };

      client.emit('beforeCaptureLog', log);

      // Replay ID should not be added
      expect(log.attributes).toEqual({
        'existing.attr': 'value',
      });
    });

    it('does not register log handler when enableLogs experiment is disabled', async () => {
      const { replay, client } = await mockSdk({
        replayOptions: {},
        sentryOptions: {
          // enableLogs experiment is not set (defaults to false)
          replaysSessionSampleRate: 1.0,
        },
      });

      replay.start();

      const log: Log = {
        level: 'info',
        message: 'test log message',
        attributes: { 'existing.attr': 'value' },
      };

      client.emit('beforeCaptureLog', log);

      // Replay ID should not be added since the handler wasn't registered
      expect(log.attributes).toEqual({
        'existing.attr': 'value',
      });
    });

    it('works with buffer mode replay', async () => {
      const { replay, integration, client } = await mockSdk({
        replayOptions: {},
        sentryOptions: {
          _experiments: { enableLogs: true },
          replaysSessionSampleRate: 0.0,
          replaysOnErrorSampleRate: 1.0, // Buffer mode
        },
      });

      // Start buffering mode
      replay.startBuffering();
      expect(integration.getRecordingMode()).toBe('buffer');

      const replayId = integration.getReplayId();
      expect(replayId).toBeDefined();

      const log: Log = {
        level: 'warn',
        message: 'warning message',
        attributes: {},
      };

      client.emit('beforeCaptureLog', log);

      expect(log.attributes).toEqual({
        'replay.id': replayId,
      });
    });
  });
});
