import * as diagnosticsChannel from 'node:diagnostics_channel';
import type { Integration, IntegrationFn, LogSeverityLevel } from '@sentry/core';
import {
  _INTERNAL_captureLog,
  addExceptionMechanism,
  captureException,
  captureMessage,
  defineIntegration,
  severityLevelFromString,
  withScope,
} from '@sentry/core';
import { addInstrumentationConfig } from '../sdk/injectLoader';

const SENTRY_TRACK_SYMBOL = Symbol('sentry-track-pino-logger');

type LevelMapping = {
  // Fortunately pino uses the same levels as Sentry
  labels: { [level: number]: LogSeverityLevel };
};

type Pino = {
  levels: LevelMapping;
  [SENTRY_TRACK_SYMBOL]?: 'track' | 'ignore';
};

type MergeObject = {
  [key: string]: unknown;
  err?: Error;
};

type PinoHookArgs = [MergeObject, string, number];

type PinoOptions = {
  /**
   * Automatically instrument all Pino loggers.
   *
   * When set to `false`, only loggers marked with `pinoIntegration.trackLogger(logger)` will be captured.
   *
   * @default true
   */
  autoInstrument: boolean;
  /**
   * Options to enable capturing of error events.
   */
  error: {
    /**
     * Levels that trigger capturing of events.
     *
     * @default []
     */
    levels: LogSeverityLevel[];
    /**
     * By default, Sentry will mark captured errors as handled.
     * Set this to `false` if you want to mark them as unhandled instead.
     *
     * @default true
     */
    handled: boolean;
  };
  /**
   * Options to enable capturing of logs.
   */
  log: {
    /**
     * Levels that trigger capturing of logs. Logs are only captured if
     * `enableLogs` is enabled.
     *
     * @default ["trace", "debug", "info", "warn", "error", "fatal"]
     */
    levels: LogSeverityLevel[];
  };
};

const DEFAULT_OPTIONS: PinoOptions = {
  autoInstrument: true,
  error: { levels: [], handled: true },
  log: { levels: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] },
};

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? Partial<T[P]> : T[P];
};

type PinoResult = {
  level?: string;
  time?: string;
  pid?: number;
  hostname?: string;
} & Record<string, unknown>;

function stripIgnoredFields(result: PinoResult): PinoResult {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { level, time, pid, hostname, ...rest } = result;
  return rest;
}

const _pinoIntegration = defineIntegration((userOptions: DeepPartial<PinoOptions> = {}) => {
  const options: PinoOptions = {
    autoInstrument: userOptions.autoInstrument !== false,
    error: { ...DEFAULT_OPTIONS.error, ...userOptions.error },
    log: { ...DEFAULT_OPTIONS.log, ...userOptions.log },
  };

  function shouldTrackLogger(logger: Pino): boolean {
    const override = logger[SENTRY_TRACK_SYMBOL];
    return override === 'track' || (override !== 'ignore' && options.autoInstrument);
  }

  return {
    name: 'Pino',
    setup: client => {
      const enableLogs = !!client.getOptions().enableLogs;

      addInstrumentationConfig({
        channelName: 'pino-log',
        // From Pino v9.10.0 a tracing channel is available directly from Pino:
        // https://github.com/pinojs/pino/pull/2281
        module: { name: 'pino', versionRange: '>=8.0.0 < 9.10.0', filePath: 'lib/tools.js' },
        functionQuery: {
          functionName: 'asJson',
          kind: 'Sync',
        },
      });

      const injectedChannel = diagnosticsChannel.tracingChannel('orchestrion:pino:pino-log');
      const integratedChannel = diagnosticsChannel.tracingChannel('pino_asJson');

      function onPinoStart(self: Pino, args: PinoHookArgs, result: PinoResult): void {
        if (!shouldTrackLogger(self)) {
          return;
        }

        const resultObj = stripIgnoredFields(result);

        const [captureObj, message, levelNumber] = args;
        const level = self?.levels?.labels?.[levelNumber] || 'info';
        const logMessage = message || (resultObj?.msg as string | undefined) || '';

        if (enableLogs && options.log.levels.includes(level)) {
          const attributes: Record<string, unknown> = {
            ...resultObj,
            'sentry.origin': 'auto.log.pino',
            'pino.logger.level': levelNumber,
          };

          _INTERNAL_captureLog({ level, message: logMessage, attributes });
        }

        if (options.error.levels.includes(level)) {
          const captureContext = {
            level: severityLevelFromString(level),
          };

          withScope(scope => {
            scope.addEventProcessor(event => {
              event.logger = 'pino';

              addExceptionMechanism(event, {
                handled: options.error.handled,
                type: 'pino',
              });

              return event;
            });

            if (captureObj.err) {
              captureException(captureObj.err, captureContext);
              return;
            }

            captureMessage(logMessage, captureContext);
          });
        }
      }

      injectedChannel.end.subscribe(data => {
        const { self, arguments: args, result } = data as { self: Pino; arguments: PinoHookArgs; result: string };
        onPinoStart(self, args, JSON.parse(result));
      });

      integratedChannel.end.subscribe(data => {
        const {
          instance,
          arguments: args,
          result,
        } = data as { instance: Pino; arguments: PinoHookArgs; result: string };
        onPinoStart(instance, args, JSON.parse(result));
      });
    },
  };
}) satisfies IntegrationFn;

interface PinoIntegrationFunction {
  (userOptions?: DeepPartial<PinoOptions>): Integration;
  /**
   * Marks a Pino logger to be tracked by the Pino integration.
   *
   * @param logger A Pino logger instance.
   */
  trackLogger(logger: unknown): void;
  /**
   * Marks a Pino logger to be ignored by the Pino integration.
   *
   * @param logger A Pino logger instance.
   */
  untrackLogger(logger: unknown): void;
}

/**
 * Integration for Pino logging library.
 * Captures Pino logs as Sentry logs and optionally captures some log levels as events.
 *
 * By default, all Pino loggers will be captured. To ignore a specific logger, use `pinoIntegration.untrackLogger(logger)`.
 *
 * If you disable automatic instrumentation with `autoInstrument: false`, you can mark specific loggers to be tracked with `pinoIntegration.trackLogger(logger)`.
 *
 * Requires Pino >=v8.0.0 and Node >=20.6.0 or >=18.19.0
 */
export const pinoIntegration = Object.assign(_pinoIntegration, {
  trackLogger(logger: unknown): void {
    if (logger && typeof logger === 'object' && 'levels' in logger) {
      (logger as Pino)[SENTRY_TRACK_SYMBOL] = 'track';
    }
  },
  untrackLogger(logger: unknown): void {
    if (logger && typeof logger === 'object' && 'levels' in logger) {
      (logger as Pino)[SENTRY_TRACK_SYMBOL] = 'ignore';
    }
  },
}) as PinoIntegrationFunction;
