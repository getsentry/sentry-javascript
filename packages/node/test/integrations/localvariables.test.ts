import type { ClientOptions, EventProcessor } from '@sentry/types';
import type { Debugger, InspectorNotification } from 'inspector';
import type { LRUMap } from 'lru_map';

import { defaultStackParser } from '../../src';
import type { DebugSession, FrameVariables } from '../../src/integrations/localvariables';
import { LocalVariables } from '../../src/integrations/localvariables';
import { getDefaultNodeClientOptions } from '../../test/helper/node-client-options';

interface ThrowOn {
  configureAndConnect?: boolean;
  getLocalVariables?: boolean;
}

class MockDebugSession implements DebugSession {
  private _onPause?: (message: InspectorNotification<Debugger.PausedEventDataType>) => void;

  constructor(private readonly _vars: Record<string, Record<string, unknown>>, private readonly _throwOn?: ThrowOn) {}

  public configureAndConnect(onPause: (message: InspectorNotification<Debugger.PausedEventDataType>) => void): void {
    if (this._throwOn?.configureAndConnect) {
      throw new Error('configureAndConnect should not be called');
    }

    this._onPause = onPause;
  }

  public async getLocalVariables(objectId: string): Promise<Record<string, unknown>> {
    if (this._throwOn?.getLocalVariables) {
      throw new Error('getLocalVariables should not be called');
    }

    return this._vars[objectId];
  }

  public runPause(message: InspectorNotification<Debugger.PausedEventDataType>) {
    this._onPause?.(message);
  }
}

interface LocalVariablesPrivate {
  _cachedFrames: LRUMap<string, Promise<FrameVariables[]>>;
  _setup(addGlobalEventProcessor: (callback: EventProcessor) => void, clientOptions: ClientOptions): void;
}

const exceptionEvent = {
  method: 'Debugger.paused',
  params: {
    reason: 'exception',
    data: {
      description:
        'Error: Some  error\n' +
        '    at two (/dist/javascript/src/main.js:23:9)\n' +
        '    at one (/dist/javascript/src/main.js:19:3)\n' +
        '    at Timeout._onTimeout (/dist/javascript/src/main.js:40:5)\n' +
        '    at listOnTimeout (node:internal/timers:559:17)\n' +
        '    at process.processTimers (node:internal/timers:502:7)',
    },
    callFrames: [
      {
        callFrameId: '-6224981551105448869.1.0',
        functionName: 'two',
        location: { scriptId: '134', lineNumber: 22 },
        url: '',
        scopeChain: [
          {
            type: 'local',
            object: {
              type: 'object',
              className: 'Object',
              objectId: '-6224981551105448869.1.2',
            },
            name: 'two',
          },
        ],
        this: {
          type: 'object',
          className: 'global',
        },
      },
      {
        callFrameId: '-6224981551105448869.1.1',
        functionName: 'one',
        location: { scriptId: '134', lineNumber: 18 },
        url: '',
        scopeChain: [
          {
            type: 'local',
            object: {
              type: 'object',
              className: 'Object',
              objectId: '-6224981551105448869.1.6',
            },
            name: 'one',
          },
        ],
        this: {
          type: 'object',
          className: 'global',
        },
      },
    ],
  },
};

describe('LocalVariables', () => {
  it('Adds local variables to stack frames', async () => {
    expect.assertions(7);

    const session = new MockDebugSession({
      '-6224981551105448869.1.2': { name: 'tim' },
      '-6224981551105448869.1.6': { arr: [1, 2, 3] },
    });
    const localVariables = new LocalVariables({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      _experiments: { includeStackLocals: true },
    });

    let eventProcessor: EventProcessor | undefined;

    (localVariables as unknown as LocalVariablesPrivate)._setup(callback => {
      eventProcessor = callback;
    }, options);

    expect(eventProcessor).toBeDefined();

    session.runPause(exceptionEvent);

    expect((localVariables as unknown as LocalVariablesPrivate)._cachedFrames.size).toBe(1);

    let frames: Promise<FrameVariables[]> | undefined;

    (localVariables as unknown as LocalVariablesPrivate)._cachedFrames.forEach(promise => {
      frames = promise;
    });

    expect(frames).toBeDefined();

    const vars = await (frames as Promise<FrameVariables[]>);

    expect(vars).toEqual([
      { function: 'two', vars: { name: 'tim' } },
      { function: 'one', vars: { arr: [1, 2, 3] } },
    ]);

    const event = await eventProcessor?.(
      {
        event_id: '9cbf882ade9a415986632ac4e16918eb',
        platform: 'node',
        timestamp: 1671113680.306,
        level: 'fatal',
        exception: {
          values: [
            {
              type: 'Error',
              value: 'Some error',
              stacktrace: {
                frames: [
                  {
                    function: 'process.processTimers',
                    lineno: 502,
                    colno: 7,
                    in_app: false,
                  },
                  {
                    function: 'listOnTimeout',
                    lineno: 559,
                    colno: 17,
                    in_app: false,
                  },
                  {
                    function: 'Timeout._onTimeout',
                    lineno: 40,
                    colno: 5,
                    in_app: true,
                  },
                  {
                    function: 'one',
                    lineno: 19,
                    colno: 3,
                    in_app: true,
                  },
                  {
                    function: 'two',
                    lineno: 23,
                    colno: 9,
                    in_app: true,
                  },
                ],
              },
              mechanism: { type: 'generic', handled: true },
            },
          ],
        },
      },
      {},
    );

    expect(event?.exception?.values?.[0].stacktrace?.frames?.[3]?.vars).toEqual({ arr: [1, 2, 3] });
    expect(event?.exception?.values?.[0].stacktrace?.frames?.[4]?.vars).toEqual({ name: 'tim' });

    expect((localVariables as unknown as LocalVariablesPrivate)._cachedFrames.size).toBe(0);
  });

  it('Should not lookup variables for non-exception reasons', async () => {
    expect.assertions(1);

    const session = new MockDebugSession({}, { getLocalVariables: true });
    const localVariables = new LocalVariables({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      _experiments: { includeStackLocals: true },
    });

    (localVariables as unknown as LocalVariablesPrivate)._setup(_ => {}, options);

    const nonExceptionEvent = {
      method: exceptionEvent.method,
      params: { ...exceptionEvent.params, reason: 'non-exception-reason' },
    };

    session.runPause(nonExceptionEvent);

    expect((localVariables as unknown as LocalVariablesPrivate)._cachedFrames.size).toBe(0);
  });

  it('Should not initialize when disabled', async () => {
    expect.assertions(1);

    const session = new MockDebugSession({}, { configureAndConnect: true });
    const localVariables = new LocalVariables({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      _experiments: { includeStackLocals: false },
    });

    let eventProcessor: EventProcessor | undefined;

    (localVariables as unknown as LocalVariablesPrivate)._setup(callback => {
      eventProcessor = callback;
    }, options);

    expect(eventProcessor).toBeUndefined();
  });

  it.only('Should cache identical uncaught exception events', async () => {
    expect.assertions(1);

    const session = new MockDebugSession({
      '-6224981551105448869.1.2': { name: 'tim' },
      '-6224981551105448869.1.6': { arr: [1, 2, 3] },
    });
    const localVariables = new LocalVariables({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      _experiments: { includeStackLocals: true },
    });

    (localVariables as unknown as LocalVariablesPrivate)._setup(_ => {}, options);

    session.runPause(exceptionEvent);
    session.runPause(exceptionEvent);
    session.runPause(exceptionEvent);
    session.runPause(exceptionEvent);
    session.runPause(exceptionEvent);

    expect((localVariables as unknown as LocalVariablesPrivate)._cachedFrames.size).toBe(1);
  });
});
