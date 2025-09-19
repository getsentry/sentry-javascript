import { tracingChannel } from 'node:diagnostics_channel';
import type { IntegrationFn, LogSeverityLevel } from '@sentry/core';
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

type LevelMapping = {
  // Fortunately pino uses the same levels as Sentry
  labels: { [level: number]: LogSeverityLevel };
};

type Pino = {
  levels: LevelMapping;
};

type MergeObject = {
  [key: string]: unknown;
  err?: Error;
};

type PinoHookArgs = [MergeObject, string, number];

type Options = {
  /**
   * Levels that trigger capturing of events.
   *
   * @default ["error", "fatal"]
   */
  eventLevels?: LogSeverityLevel[];
  /**
   * By default, Sentry will mark captured console messages as handled.
   * Set this to `false` if you want to mark them as unhandled instead.
   *
   * @default true
   */
  handled?: boolean;
};

const DEFAULT_OPTIONS: Options = { eventLevels: ['error', 'fatal'], handled: true };

/**
 * Integration for Pino logging library.
 * Captures Pino logs as Sentry logs and optionally captures some log levels as events.
 *
 * Requires Pino >=v8.0.0 and Node >=20.6.0 or >=18.19.0
 */
export const pinoIntegration = defineIntegration((options: Options = DEFAULT_OPTIONS) => {
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

      const injectedChannel = tracingChannel('orchestrion:pino:pino-log');
      const integratedChannel = tracingChannel('tracing:pino_asJson');

      function onPinoStart(self: Pino, args: PinoHookArgs): void {
        const [obj, message, levelNumber] = args;
        const level = self?.levels?.labels?.[levelNumber] || 'info';

        const attributes = {
          'sentry.origin': 'auto.logging.pino',
          'sentry.pino.level': levelNumber,
          ...obj,
        };

        if (enableLogs) {
          _INTERNAL_captureLog({ level, message, attributes });
        }

        if (options.eventLevels?.includes(level)) {
          const captureContext = {
            level: severityLevelFromString(level),
          };

          withScope(scope => {
            scope.addEventProcessor(event => {
              event.logger = 'pino';

              addExceptionMechanism(event, {
                handled: !!options.handled,
                type: 'pino',
              });

              return event;
            });

            if (obj.err) {
              captureException(obj.err, captureContext);
              return;
            }

            captureMessage(message, captureContext);
          });
        }
      }

      injectedChannel.start.subscribe(data => {
        const { self, arguments: args } = data as { self: Pino; arguments: PinoHookArgs };
        onPinoStart(self, args);
      });

      integratedChannel.start.subscribe(data => {
        const { instance, arguments: args } = data as { instance: Pino; arguments: PinoHookArgs };
        onPinoStart(instance, args);
      });
    },
  };
}) satisfies IntegrationFn;
