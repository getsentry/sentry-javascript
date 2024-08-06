import { addBreadcrumb, captureException } from '@sentry/core';
import type { SeverityLevel } from '@sentry/types';
import { logger as coreLogger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';

const CONSOLE_LEVELS = ['info', 'warn', 'error', 'log'] as const;

type LoggerMethod = (...args: unknown[]) => void;
type LoggerConsoleMethods = Record<'info' | 'warn' | 'error' | 'log', LoggerMethod>;

/** JSDoc */
interface ReplayLogger extends LoggerConsoleMethods {
  /**
   * Calls `logger.info` but saves breadcrumb in the next tick due to race
   * conditions before replay is initialized.
   */
  infoTick(...args: unknown[]): void;
  /**
   * Captures exceptions (`Error`) if "capture internal exceptions" is enabled
   */
  exception(error: unknown): void;
  enableCaptureInternalExceptions(): void;
  disableCaptureInternalExceptions(): void;
  enableTraceInternals(): void;
  disableTraceInternals(): void;
}

function _addBreadcrumb(message: string, level: SeverityLevel = 'info'): void {
  // Wait a tick here to avoid race conditions for some initial logs
  // which may be added before replay is initialized
  addBreadcrumb(
    {
      category: 'console',
      data: {
        logger: 'replay',
      },
      level,
      message: `[Replay] ${message}`,
    },
    { level },
  );
}

function makeReplayLogger(): ReplayLogger {
  let _capture = false;
  let _trace = false;

  const _logger: Partial<ReplayLogger> = {
    exception: () => undefined,
    infoTick: () => undefined,
    enableCaptureInternalExceptions: () => {
      _capture = true;
    },
    disableCaptureInternalExceptions: () => {
      _capture = false;
    },
    enableTraceInternals: () => {
      _trace = true;
    },
    disableTraceInternals: () => {
      _trace = false;
    },
  };

  if (DEBUG_BUILD) {
    _logger.exception = (error: unknown) => {
      coreLogger.error('[Replay] ', error);

      if (_capture) {
        captureException(error);
      }

      // No need for a breadcrumb is `_capture` is enabled since it should be
      // captured as an exception
      if (_trace && !_capture) {
        _addBreadcrumb(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    _logger.infoTick = (...args: unknown[]) => {
      coreLogger.info('[Replay] ', ...args);
      if (_trace) {
        setTimeout(() => typeof args[0] === 'string' && _addBreadcrumb(args[0]), 0);
      }
    };

    CONSOLE_LEVELS.forEach(name => {
      _logger[name] = (...args: unknown[]) => {
        coreLogger[name]('[Replay] ', ...args);
        if (_trace && typeof args[0] === 'string') {
          _addBreadcrumb(args[0]);
        }
      };
    });
  } else {
    CONSOLE_LEVELS.forEach(name => {
      _logger[name] = () => undefined;
    });
  }

  return _logger as ReplayLogger;
}

export const logger = makeReplayLogger();
