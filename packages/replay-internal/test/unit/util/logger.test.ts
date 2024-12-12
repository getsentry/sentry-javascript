import { beforeEach, describe, expect, it } from 'vitest';

import * as SentryCore from '@sentry/core';
import { logger as coreLogger } from '@sentry/core';
import { logger } from '../../../src/util/logger';

const mockCaptureException = vi.spyOn(SentryCore, 'captureException');
const mockAddBreadcrumb = vi.spyOn(SentryCore, 'addBreadcrumb');
const mockLogError = vi.spyOn(coreLogger, 'error');
vi.spyOn(coreLogger, 'info');
vi.spyOn(coreLogger, 'log');
vi.spyOn(coreLogger, 'warn');

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
      logger.setConfig({
        captureExceptions,
        traceInternals,
      });
    });

    it.each([
      ['info', 'info', 'info message'],
      ['log', 'log', 'log message'],
      ['warn', 'warning', 'warn message'],
      ['error', 'error', 'error message'],
    ])('%s', (fn, level, message) => {
      logger[fn](message);
      expect(coreLogger[fn]).toHaveBeenCalledWith('[Replay] ', message);

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
      logger.exception(err, 'a message');
      if (captureExceptions) {
        expect(mockCaptureException).toHaveBeenCalledWith(err);
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
      logger.exception(err);
      if (captureExceptions) {
        expect(mockCaptureException).toHaveBeenCalledWith(err);
        expect(mockAddBreadcrumb).not.toHaveBeenCalled();
      }
      expect(mockLogError).toHaveBeenCalledTimes(1);
      expect(mockLogError).toHaveBeenLastCalledWith('[Replay] ', err);
    });
  });
});
