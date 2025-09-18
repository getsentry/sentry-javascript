import { tracingChannel } from 'node:diagnostics_channel';
import type { IntegrationFn, LogSeverityLevel } from '@sentry/core';
import {
  _INTERNAL_captureLog,
  addExceptionMechanism,
  captureException,
  captureMessage,
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

type PinoHookArgs = {
  self: Pino;
  arguments: [MergeObject, string, number];
};

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

function attributesFromObject(obj: object, attr: Record<string, unknown>, key?: string): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const newKey = key ? `${key}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Error)) {
      attributesFromObject(v as object, attr, newKey);
    } else {
      attr[newKey] = v;
    }
  }
  return attr;
}

export const pinoIntegration = ((options: Options = { eventLevels: ['error', 'fatal'], handled: true }) => {
  return {
    name: 'Pino',
    setup: () => {
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
      const integratedChannel = tracingChannel('pino_asJson');

      const onPinoStart = (data: unknown): void => {
        const { self, arguments: args } = data as PinoHookArgs;
        const [obj, message, levelNumber] = args;
        const level = self?.levels?.labels?.[levelNumber] || 'info';

        const attributes = attributesFromObject(obj, {
          'sentry.origin': 'auto.logging.pino',
          'sentry.pino.level': levelNumber,
        });

        _INTERNAL_captureLog({ level, message, attributes });

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
      };

      injectedChannel.start.subscribe(onPinoStart);
      integratedChannel.start.subscribe(onPinoStart);
    },
  };
}) satisfies IntegrationFn;
