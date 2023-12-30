import type { Debugger, InspectorNotification } from 'inspector';

import { NodeClient, defaultStackParser } from '../../src';
import { createRateLimiter } from '../../src/integrations/local-variables/common';
import type { FrameVariables } from '../../src/integrations/local-variables/common';
import type { DebugSession } from '../../src/integrations/local-variables/local-variables-sync';
import { LocalVariablesSync, createCallbackList } from '../../src/integrations/local-variables/local-variables-sync';
import { NODE_VERSION } from '../../src/nodeVersion';
import { getDefaultNodeClientOptions } from '../../test/helper/node-client-options';

jest.setTimeout(20_000);

const describeIf = (condition: boolean) => (condition ? describe : describe.skip);

interface ThrowOn {
  configureAndConnect?: boolean;
  getLocalVariables?: boolean;
}

class MockDebugSession implements DebugSession {
  private _onPause?: (message: InspectorNotification<Debugger.PausedEventDataType>, callback: () => void) => void;

  constructor(private readonly _vars: Record<string, Record<string, unknown>>, private readonly _throwOn?: ThrowOn) {}

  public configureAndConnect(
    onPause: (message: InspectorNotification<Debugger.PausedEventDataType>, callback: () => void) => void,
    _captureAll: boolean,
  ): void {
    if (this._throwOn?.configureAndConnect) {
      throw new Error('configureAndConnect should not be called');
    }

    this._onPause = onPause;
  }

  public setPauseOnExceptions(_: boolean): void {}

  public getLocalVariables(objectId: string, callback: (vars: Record<string, unknown>) => void): void {
    if (this._throwOn?.getLocalVariables) {
      throw new Error('getLocalVariables should not be called');
    }

    callback(this._vars[objectId]);
  }

  public runPause(message: InspectorNotification<Debugger.PausedEventDataType>): Promise<void> {
    return new Promise(resolve => {
      this._onPause?.(message, resolve);
    });
  }
}

interface LocalVariablesPrivate {
  _getCachedFramesCount(): number;
  _getFirstCachedFrame(): FrameVariables[] | undefined;
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

const exceptionEvent100Frames = {
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
    callFrames: new Array(100).fill({
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
    }),
  },
};

describeIf(NODE_VERSION.major >= 18)('LocalVariables', () => {
  it('Adds local variables to stack frames', async () => {
    const session = new MockDebugSession({
      '-6224981551105448869.1.2': { name: 'tim' },
      '-6224981551105448869.1.6': { arr: [1, 2, 3] },
    });
    const localVariables = new LocalVariablesSync({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      includeLocalVariables: true,
      integrations: [localVariables],
    });

    const client = new NodeClient(options);
    client.setupIntegrations(true);

    const eventProcessors = client['_eventProcessors'];
    const eventProcessor = eventProcessors.find(processor => processor.id === 'LocalVariablesSync');

    expect(eventProcessor).toBeDefined();

    await session.runPause(exceptionEvent);

    expect((localVariables as unknown as LocalVariablesPrivate)._getCachedFramesCount()).toBe(1);

    const frames = (localVariables as unknown as LocalVariablesPrivate)._getFirstCachedFrame();

    expect(frames).toBeDefined();

    const vars = frames as FrameVariables[];

    expect(vars).toEqual([
      { function: 'two', vars: { name: 'tim' } },
      { function: 'one', vars: { arr: [1, 2, 3] } },
    ]);

    const event = await eventProcessor!(
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

    expect((localVariables as unknown as LocalVariablesPrivate)._getCachedFramesCount()).toBe(0);
  });

  it('Only considers the first 5 frames', async () => {
    const session = new MockDebugSession({});
    const localVariables = new LocalVariablesSync({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      includeLocalVariables: true,
      integrations: [localVariables],
    });

    const client = new NodeClient(options);
    client.setupIntegrations(true);

    await session.runPause(exceptionEvent100Frames);

    expect((localVariables as unknown as LocalVariablesPrivate)._getCachedFramesCount()).toBe(1);

    const frames = (localVariables as unknown as LocalVariablesPrivate)._getFirstCachedFrame();

    expect(frames).toBeDefined();

    const vars = frames as FrameVariables[];

    expect(vars.length).toEqual(5);
  });

  it('Should not lookup variables for non-exception reasons', async () => {
    const session = new MockDebugSession({}, { getLocalVariables: true });
    const localVariables = new LocalVariablesSync({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      includeLocalVariables: true,
      integrations: [localVariables],
    });

    const client = new NodeClient(options);
    client.setupIntegrations(true);

    const nonExceptionEvent = {
      method: exceptionEvent.method,
      params: { ...exceptionEvent.params, reason: 'non-exception-reason' },
    };

    await session.runPause(nonExceptionEvent);

    expect((localVariables as unknown as LocalVariablesPrivate)._getCachedFramesCount()).toBe(0);
  });

  it('Should not initialize when disabled', async () => {
    const session = new MockDebugSession({}, { configureAndConnect: true });
    const localVariables = new LocalVariablesSync({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      integrations: [localVariables],
    });

    const client = new NodeClient(options);
    client.setupIntegrations(true);

    const eventProcessors = client['_eventProcessors'];
    const eventProcessor = eventProcessors.find(processor => processor.id === 'LocalVariablesSync');

    expect(eventProcessor).toBeDefined();
  });

  it('Should not initialize when inspector not loaded', async () => {
    const localVariables = new LocalVariablesSync({}, undefined);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      integrations: [localVariables],
    });

    const client = new NodeClient(options);
    client.setupIntegrations(true);

    const eventProcessors = client['_eventProcessors'];
    const eventProcessor = eventProcessors.find(processor => processor.id === 'LocalVariablesSync');

    expect(eventProcessor).toBeDefined();
  });

  it('Should cache identical uncaught exception events', async () => {
    const session = new MockDebugSession({
      '-6224981551105448869.1.2': { name: 'tim' },
      '-6224981551105448869.1.6': { arr: [1, 2, 3] },
    });
    const localVariables = new LocalVariablesSync({}, session);
    const options = getDefaultNodeClientOptions({
      stackParser: defaultStackParser,
      includeLocalVariables: true,
      integrations: [localVariables],
    });

    const client = new NodeClient(options);
    client.setupIntegrations(true);

    await session.runPause(exceptionEvent);
    await session.runPause(exceptionEvent);
    await session.runPause(exceptionEvent);
    await session.runPause(exceptionEvent);
    await session.runPause(exceptionEvent);

    expect((localVariables as unknown as LocalVariablesPrivate)._getCachedFramesCount()).toBe(1);
  });

  describe('createCallbackList', () => {
    it('Should call callbacks in reverse order', done => {
      const log: number[] = [];

      const { add, next } = createCallbackList<number>(n => {
        expect(log).toEqual([5, 4, 3, 2, 1]);
        expect(n).toBe(15);
        done();
      });

      add(n => {
        log.push(1);
        next(n + 1);
      });

      add(n => {
        log.push(2);
        next(n + 1);
      });

      add(n => {
        log.push(3);
        next(n + 1);
      });

      add(n => {
        log.push(4);
        next(n + 1);
      });

      add(n => {
        log.push(5);
        next(n + 11);
      });

      next(0);
    });

    it('only calls complete once even if multiple next', done => {
      const { add, next } = createCallbackList<number>(n => {
        expect(n).toBe(1);
        done();
      });

      add(n => {
        next(n + 1);
        // We dont actually do this in our code...
        next(n + 1);
      });

      next(0);
    });

    it('calls completed if added closure throws', done => {
      const { add, next } = createCallbackList<number>(n => {
        expect(n).toBe(10);
        done();
      });

      add(n => {
        throw new Error('test');
        next(n + 1);
      });

      next(10);
    });
  });

  describe('rateLimiter', () => {
    it('calls disable if exceeded', done => {
      const increment = createRateLimiter(
        5,
        () => {},
        () => {
          done();
        },
      );

      for (let i = 0; i < 7; i++) {
        increment();
      }
    });

    it('does not call disable if not exceeded', done => {
      const increment = createRateLimiter(
        5,
        () => {
          throw new Error('Should not be called');
        },
        () => {
          throw new Error('Should not be called');
        },
      );

      let count = 0;

      const timer = setInterval(() => {
        for (let i = 0; i < 4; i++) {
          increment();
        }

        count += 1;

        if (count >= 5) {
          clearInterval(timer);
          done();
        }
      }, 1_000);
    });

    it('re-enables after timeout', done => {
      let called = false;

      const increment = createRateLimiter(
        5,
        () => {
          expect(called).toEqual(true);
          done();
        },
        () => {
          expect(called).toEqual(false);
          called = true;
        },
      );

      for (let i = 0; i < 10; i++) {
        increment();
      }
    });
  });
});
