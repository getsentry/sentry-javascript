import type { Event, StackFrame } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, NodeClient } from '../../src';
import type { FrameVariables } from '../../src/integrations/local-variables/common';
import type { DebugSession } from '../../src/integrations/local-variables/local-variables-sync';
import { hashFrames, localVariablesSyncIntegration } from '../../src/integrations/local-variables/local-variables-sync';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';

const mockSession: DebugSession = {
  configureAndConnect: () => {},
  setPauseOnExceptions: () => {},
  getLocalVariables: () => {},
};

describe('LocalVariables', () => {
  beforeEach(() => {
    const options = getDefaultNodeClientOptions({
      includeLocalVariables: true,
      dsn: 'https://public@dsn.ingest.sentry.io/1337',
    });
    const client = new NodeClient(options);
    getCurrentScope().setClient(client);
  });

  it('does not add local variables to out of app frames by default', async () => {
    const eventName = 'test-exclude-LocalVariables-out-of-app-frames';
    const event = getTestEvent(eventName);
    const integration = localVariablesSyncIntegration({}, mockSession);
    integration.setupOnce?.();

    const hash = hashFrames(event.exception!.values![0]!.stacktrace!.frames);
    // @ts-expect-error test helper method
    integration._setCachedFrame(hash!, [{ function: eventName, vars: { foo: 'bar' } } as FrameVariables]);

    const processedEvent = (await integration.processEvent?.(event, {}, {} as any)) as Event;

    expect(processedEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
  });

  it('adds local variables to out of app frames when includeOutOfAppFrames is true', async () => {
    const eventName = 'test-include-LocalVariables-out-of-app-frames';
    const event = getTestEvent(eventName);
    const integration = localVariablesSyncIntegration({ includeOutOfAppFrames: true }, mockSession);
    integration.setupOnce?.();

    const hash = hashFrames(event.exception!.values![0]!.stacktrace!.frames);
    // @ts-expect-error test helper method
    integration._setCachedFrame(hash!, [{ function: eventName, vars: { foo: 'bar' } } as FrameVariables]);

    const processedEvent = (await integration.processEvent?.(event, {}, {} as any)) as Event;

    expect(processedEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toEqual({ foo: 'bar' });
  });
});

function getTestEvent(fnName = 'test'): Event {
  return {
    exception: {
      values: [
        {
          stacktrace: {
            frames: [
              {
                in_app: false,
                function: fnName,
                lineno: 1,
                colno: 1,
              } as StackFrame,
            ],
          },
        },
      ],
    },
  };
}
