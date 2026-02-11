import type { ConsoleLevel, SeverityLevel } from '@sentry/core';
import { addBreadcrumb, captureException, debug as coreDebug, severityLevelFromString } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

type ReplayConsoleLevels = Extract<ConsoleLevel, 'log' | 'warn' | 'error'>;
const CONSOLE_LEVELS: readonly ReplayConsoleLevels[] = ['log', 'warn', 'error'] as const;
const PREFIX = '[Replay] ';

interface LoggerConfig {
  captureExceptions: boolean;
  traceInternals: boolean;
}

type CoreDebugLogger = typeof coreDebug;

interface ReplayDebugLogger extends CoreDebugLogger {
  /**
   * Calls `debug.log` but saves breadcrumb in the next tick due to race
   * conditions before replay is initialized.
   */
  infoTick: CoreDebugLogger['log'];
  /**
   * Captures exceptions (`Error`) if "capture internal exceptions" is enabled
   */
  exception: CoreDebugLogger['error'];
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

function makeReplayDebugLogger(): ReplayDebugLogger {
  let _capture = false;
  let _trace = false;

  const _debug: Partial<ReplayDebugLogger> = {
    exception: () => undefined,
    infoTick: () => undefined,
    setConfig: (opts: Partial<LoggerConfig>) => {
      _capture = !!opts.captureExceptions;
      _trace = !!opts.traceInternals;
    },
  };

  if (DEBUG_BUILD) {
    CONSOLE_LEVELS.forEach(name => {
      _debug[name] = (...args: unknown[]) => {
        coreDebug[name](PREFIX, ...args);
        if (_trace) {
          _addBreadcrumb(args.join(''), severityLevelFromString(name));
        }
      };
    });

    _debug.exception = (error: unknown, ...message: unknown[]) => {
      if (message.length && _debug.error) {
        _debug.error(...message);
      }

      coreDebug.error(PREFIX, error);

      if (_capture) {
        captureException(error, {
          mechanism: {
            handled: true,
            type: 'auto.function.replay.debug',
          },
        });
      } else if (_trace) {
        // No need for a breadcrumb if `_capture` is enabled since it should be
        // captured as an exception
        _addBreadcrumb(error, 'error');
      }
    };

    _debug.infoTick = (...args: unknown[]) => {
      coreDebug.log(PREFIX, ...args);
      if (_trace) {
        // Wait a tick here to avoid race conditions for some initial logs
        // which may be added before replay is initialized
        setTimeout(() => _addBreadcrumb(args[0]), 0);
      }
    };
  } else {
    CONSOLE_LEVELS.forEach(name => {
      _debug[name] = () => undefined;
    });
  }

  return _debug as ReplayDebugLogger;
}

export const debug = makeReplayDebugLogger();
