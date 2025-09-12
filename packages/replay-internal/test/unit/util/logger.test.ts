import * as SentryCore from '@sentry/core';
import { debug as coreDebugLogger } from '@sentry/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debug } from '../../../src/util/logger';

const mockCaptureException = vi.spyOn(SentryCore, 'captureException');
const mockAddBreadcrumb = vi.spyOn(SentryCore, 'addBreadcrumb');
const mockLogError = vi.spyOn(coreDebugLogger, 'error');
vi.spyOn(coreDebugLogger, 'log');
vi.spyOn(coreDebugLogger, 'warn');

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('with options: captureExceptions:%s, traceInternals:%s', (captureExceptions, traceInternals) => {
    beforeEach(() => {
      debug.setConfig({
        captureExceptions,
        traceInternals,
      });
    });

    it.each([
      ['log', 'log', 'log message'],
      ['warn', 'warning', 'warn message'],
      ['error', 'error', 'error message'],
    ] as const)('%s', (fn, level, message) => {
      debug[fn](message);
      expect(coreDebugLogger[fn]).toHaveBeenCalledWith('[Replay] ', message);

      if (traceInternals) {
        expect(mockAddBreadcrumb).toHaveBeenLastCalledWith(
          {
            category: 'console',
            data: { logger: 'replay' },
            level,
            message: `[Replay] ${message}`,
          },
          { level },
        );
      }
    });

    it('logs exceptions with a message', () => {
      const err = new Error('An error');
      debug.exception(err, 'a message');
      if (captureExceptions) {
        expect(mockCaptureException).toHaveBeenCalledWith(err, {
          mechanism: {
            handled: true,
            type: 'auto.function.replay.debug',
          },
        });
      }
      expect(mockLogError).toHaveBeenCalledWith('[Replay] ', 'a message');
      expect(mockLogError).toHaveBeenLastCalledWith('[Replay] ', err);
      expect(mockLogError).toHaveBeenCalledTimes(2);

      if (traceInternals) {
        expect(mockAddBreadcrumb).toHaveBeenCalledWith(
          {
            category: 'console',
            data: { logger: 'replay' },
            level: 'error',
            message: '[Replay] a message',
          },
          { level: 'error' },
        );
      }
    });

    it('logs exceptions without a message', () => {
      const err = new Error('An error');
      debug.exception(err);
      if (captureExceptions) {
        expect(mockCaptureException).toHaveBeenCalledWith(err, {
          mechanism: {
            handled: true,
            type: 'auto.function.replay.debug',
          },
        });
        expect(mockAddBreadcrumb).not.toHaveBeenCalled();
      }
      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenLastCalledWith('[Replay] ', err);
    });
  });
});
