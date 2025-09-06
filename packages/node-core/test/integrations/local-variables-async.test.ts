import type { Event, EventHint, StackFrame } from '@sentry/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { getCurrentScope, NodeClient } from '../../src';
import type { FrameVariables } from '../../src/integrations/local-variables/common';
import { LOCAL_VARIABLES_KEY } from '../../src/integrations/local-variables/common';
import { localVariablesAsyncIntegration } from '../../src/integrations/local-variables/local-variables-async';
import { getDefaultNodeClientOptions } from '../helpers/getDefaultNodeClientOptions';

describe('LocalVariablesAsync', () => {
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
    const integration = localVariablesAsyncIntegration({});
    await integration.setup?.(getCurrentScope().getClient<NodeClient>()!);

    const hint: EventHint = {
      originalException: {
        [LOCAL_VARIABLES_KEY]: [{ function: eventName, vars: { foo: 'bar' } } as FrameVariables],
      },
    };

    const processedEvent = integration.processEvent?.(event, hint, getCurrentScope().getClient<NodeClient>()!) as Event;

    expect(processedEvent.exception?.values?.[0]?.stacktrace?.frames?.[0]?.vars).toBeUndefined();
  });

  it('adds local variables to out of app frames when includeOutOfAppFrames is true', async () => {
    const eventName = 'test-include-LocalVariables-out-of-app-frames';
    const event = getTestEvent(eventName);
    const integration = localVariablesAsyncIntegration({ includeOutOfAppFrames: true });
    await integration.setup?.(getCurrentScope().getClient<NodeClient>()!);

    const hint: EventHint = {
      originalException: {
        [LOCAL_VARIABLES_KEY]: [{ function: eventName, vars: { foo: 'bar' } } as FrameVariables],
      },
    };

    const processedEvent = integration.processEvent?.(event, hint, getCurrentScope().getClient<NodeClient>()!) as Event;

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
