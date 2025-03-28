import type { ConsoleLevel, Logger, SeverityLevel } from '@sentry/core';
import { addBreadcrumb, captureException, logger as coreLogger, severityLevelFromString } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

type ReplayConsoleLevels = Extract<ConsoleLevel, 'info' | 'warn' | 'error' | 'log'>;
const CONSOLE_LEVELS: readonly ReplayConsoleLevels[] = ['info', 'warn', 'error', 'log'] as const;
const PREFIX = '[Replay] ';

type LoggerMethod = (...args: unknown[]) => void;

interface LoggerConfig {
  captureExceptions: boolean;
  traceInternals: boolean;
}

interface ReplayLogger extends Logger {
  /**
   * Calls `logger.info` but saves breadcrumb in the next tick due to race
   * conditions before replay is initialized.
   */
  infoTick: LoggerMethod;
  /**
   * Captures exceptions (`Error`) if "capture internal exceptions" is enabled
   */
  exception: LoggerMethod;
  /**
   * Configures the logger with additional debugging behavior
   */
  setConfig(config: Partial<LoggerConfig>): void;
}

function _addBreadcrumb(message: unknown, level: SeverityLevel = 'info'): void {
  addBreadcrumb(
    {
      category: 'console',
      data: {
        logger: 'replay',
      },
      level,
      message: `${PREFIX}${message}`,
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
    setConfig: (opts: Partial<LoggerConfig>) => {
      _capture = !!opts.captureExceptions;
      _trace = !!opts.traceInternals;
    },
  };

  if (DEBUG_BUILD) {
    CONSOLE_LEVELS.forEach(name => {
      _logger[name] = (...args: unknown[]) => {
        coreLogger[name](PREFIX, ...args);
        if (_trace) {
          _addBreadcrumb(args.join(''), severityLevelFromString(name));
        }
      };
    });

    _logger.exception = (error: unknown, ...message: unknown[]) => {
      if (message.length && _logger.error) {
        _logger.error(...message);
      }

      coreLogger.error(PREFIX, error);

      if (_capture) {
        captureException(error);
      } else if (_trace) {
        // No need for a breadcrumb if `_capture` is enabled since it should be
        // captured as an exception
        _addBreadcrumb(error, 'error');
      }
    };

    _logger.infoTick = (...args: unknown[]) => {
      coreLogger.info(PREFIX, ...args);
      if (_trace) {
        // Wait a tick here to avoid race conditions for some initial logs
        // which may be added before replay is initialized
        setTimeout(() => _addBreadcrumb(args[0]), 0);
      }
    };
  } else {
    CONSOLE_LEVELS.forEach(name => {
      _logger[name] = () => undefined;
    });
  }

  return _logger as ReplayLogger;
}

export const logger = makeReplayLogger();
