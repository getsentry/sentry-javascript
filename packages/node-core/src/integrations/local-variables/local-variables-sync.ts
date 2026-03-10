import type { Debugger, InspectorNotification, Runtime, Session } from 'node:inspector';
import type { Event, Exception, IntegrationFn, StackFrame, StackParser } from '@sentry/core';
import { debug, defineIntegration, getClient, LRUMap } from '@sentry/core';
import { NODE_MAJOR } from '../../nodeVersion';
import type { NodeClient } from '../../sdk/client';
import { isDebuggerEnabled } from '../../utils/debug';
import type {
  FrameVariables,
  LocalVariablesIntegrationOptions,
  PausedExceptionEvent,
  RateLimitIncrement,
  Variables,
} from './common';
import { createRateLimiter, functionNamesMatch } from './common';

/** Creates a unique hash from stack frames */
export function hashFrames(frames: StackFrame[] | undefined): string | undefined {
  if (frames === undefined) {
    return;
  }

  // Only hash the 10 most recent frames (ie. the last 10)
  return frames.slice(-10).reduce((acc, frame) => `${acc},${frame.function},${frame.lineno},${frame.colno}`, '');
}

/**
 * We use the stack parser to create a unique hash from the exception stack trace
 * This is used to lookup vars when the exception passes through the event processor
 */
export function hashFromStack(stackParser: StackParser, stack: string | undefined): string | undefined {
  if (stack === undefined) {
    return undefined;
  }

  return hashFrames(stackParser(stack, 1));
}

type OnPauseEvent = InspectorNotification<Debugger.PausedEventDataType>;
export interface DebugSession {
  /** Configures and connects to the debug session */
  configureAndConnect(onPause: (message: OnPauseEvent, complete: () => void) => void, captureAll: boolean): void;
  /** Updates which kind of exceptions to capture */
  setPauseOnExceptions(captureAll: boolean): void;
  /** Gets local variables for an objectId */
  getLocalVariables(objectId: string, callback: (vars: Variables) => void): void;
}

type Next<T> = (result: T) => void;
type Add<T> = (fn: Next<T>) => void;
type CallbackWrapper<T> = { add: Add<T>; next: Next<T> };

/** Creates a container for callbacks to be called sequentially */
export function createCallbackList<T>(complete: Next<T>): CallbackWrapper<T> {
  // A collection of callbacks to be executed last to first
  let callbacks: Next<T>[] = [];

  let completedCalled = false;
  function checkedComplete(result: T): void {
    callbacks = [];
    if (completedCalled) {
      return;
    }
    completedCalled = true;
    complete(result);
  }

  // complete should be called last
  callbacks.push(checkedComplete);

  function add(fn: Next<T>): void {
    callbacks.push(fn);
  }

  function next(result: T): void {
    const popped = callbacks.pop() || checkedComplete;

    try {
      popped(result);
    } catch {
      // If there is an error, we still want to call the complete callback
      checkedComplete(result);
    }
  }

  return { add, next };
}

/**
 * Promise API is available as `Experimental` and in Node 19 only.
 *
 * Callback-based API is `Stable` since v14 and `Experimental` since v8.
 * Because of that, we are creating our own `AsyncSession` class.
 *
 * https://nodejs.org/docs/latest-v19.x/api/inspector.html#promises-api
 * https://nodejs.org/docs/latest-v14.x/api/inspector.html
 */
class AsyncSession implements DebugSession {
  /** Throws if inspector API is not available */
  private constructor(private readonly _session: Session) {
    //
  }

  public static async create(orDefault?: DebugSession | undefined): Promise<DebugSession> {
    if (orDefault) {
      return orDefault;
    }

    const inspector = await import('node:inspector');
    return new AsyncSession(new inspector.Session());
  }

  /** @inheritdoc */
  public configureAndConnect(onPause: (event: OnPauseEvent, complete: () => void) => void, captureAll: boolean): void {
    this._session.connect();

    this._session.on('Debugger.paused', event => {
      onPause(event, () => {
        // After the pause work is complete, resume execution or the exception context memory is leaked
        this._session.post('Debugger.resume');
      });
    });

    this._session.post('Debugger.enable');
    this._session.post('Debugger.setPauseOnExceptions', { state: captureAll ? 'all' : 'uncaught' });
  }

  public setPauseOnExceptions(captureAll: boolean): void {
    this._session.post('Debugger.setPauseOnExceptions', { state: captureAll ? 'all' : 'uncaught' });
  }

  /** @inheritdoc */
  public getLocalVariables(objectId: string, complete: (vars: Variables) => void): void {
    this._getProperties(objectId, props => {
      const { add, next } = createCallbackList<Variables>(complete);

      for (const prop of props) {
        if (prop.value?.objectId && prop.value.className === 'Array') {
          const id = prop.value.objectId;
          add(vars => this._unrollArray(id, prop.name, vars, next));
        } else if (prop.value?.objectId && prop.value.className === 'Object') {
          const id = prop.value.objectId;
          add(vars => this._unrollObject(id, prop.name, vars, next));
        } else if (prop.value) {
          add(vars => this._unrollOther(prop, vars, next));
        }
      }

      next({});
    });
  }

  /**
   * Gets all the PropertyDescriptors of an object
   */
  private _getProperties(objectId: string, next: (result: Runtime.PropertyDescriptor[]) => void): void {
    this._session.post(
      'Runtime.getProperties',
      {
        objectId,
        ownProperties: true,
      },
      (err, params) => {
        if (err) {
          next([]);
        } else {
          next(params.result);
        }
      },
    );
  }

  /**
   * Unrolls an array property
   */
  private _unrollArray(objectId: string, name: string, vars: Variables, next: (vars: Variables) => void): void {
    this._getProperties(objectId, props => {
      vars[name] = props
        .filter(v => v.name !== 'length' && !isNaN(parseInt(v.name, 10)))
        .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
        .map(v => v.value?.value);

      next(vars);
    });
  }

  /**
   * Unrolls an object property
   */
  private _unrollObject(objectId: string, name: string, vars: Variables, next: (obj: Variables) => void): void {
    this._getProperties(objectId, props => {
      vars[name] = props
        .map<[string, unknown]>(v => [v.name, v.value?.value])
        .reduce((obj, [key, val]) => {
          obj[key] = val;
          return obj;
        }, {} as Variables);

      next(vars);
    });
  }

  /**
   * Unrolls other properties
   */
  private _unrollOther(prop: Runtime.PropertyDescriptor, vars: Variables, next: (vars: Variables) => void): void {
    if (prop.value) {
      if ('value' in prop.value) {
        if (prop.value.value === undefined || prop.value.value === null) {
          vars[prop.name] = `<${prop.value.value}>`;
        } else {
          vars[prop.name] = prop.value.value;
        }
      } else if ('description' in prop.value && prop.value.type !== 'function') {
        vars[prop.name] = `<${prop.value.description}>`;
      } else if (prop.value.type === 'undefined') {
        vars[prop.name] = '<undefined>';
      }
    }

    next(vars);
  }
}

const INTEGRATION_NAME = 'LocalVariables';

/**
 * Adds local variables to exception frames
 */
const _localVariablesSyncIntegration = ((
  options: LocalVariablesIntegrationOptions = {},
  sessionOverride?: DebugSession,
) => {
  const cachedFrames: LRUMap<string, FrameVariables[]> = new LRUMap(20);
  let rateLimiter: RateLimitIncrement | undefined;
  let shouldProcessEvent = false;

  function addLocalVariablesToException(exception: Exception): void {
    const hash = hashFrames(exception.stacktrace?.frames);

    if (hash === undefined) {
      return;
    }

    // Check if we have local variables for an exception that matches the hash
    // remove is identical to get but also removes the entry from the cache
    const cachedFrame = cachedFrames.remove(hash);

    if (cachedFrame === undefined) {
      return;
    }

    // Filter out frames where the function name is `new Promise` since these are in the error.stack frames
    // but do not appear in the debugger call frames
    const frames = (exception.stacktrace?.frames || []).filter(frame => frame.function !== 'new Promise');

    for (let i = 0; i < frames.length; i++) {
      // Sentry frames are in reverse order
      const frameIndex = frames.length - i - 1;

      const cachedFrameVariable = cachedFrame[i];
      const frameVariable = frames[frameIndex];

      // Drop out if we run out of frames to match up
      if (!frameVariable || !cachedFrameVariable) {
        break;
      }

      if (
        // We need to have vars to add
        cachedFrameVariable.vars === undefined ||
        // Only skip out-of-app frames if includeOutOfAppFrames is not true
        (frameVariable.in_app === false && options.includeOutOfAppFrames !== true) ||
        // The function names need to match
        !functionNamesMatch(frameVariable.function, cachedFrameVariable.function)
      ) {
        continue;
      }

      frameVariable.vars = cachedFrameVariable.vars;
    }
  }

  function addLocalVariablesToEvent(event: Event): Event {
    for (const exception of event.exception?.values || []) {
      addLocalVariablesToException(exception);
    }

    return event;
  }

  let setupPromise: Promise<void> | undefined;

  async function setup(): Promise<void> {
    const client = getClient<NodeClient>();
    const clientOptions = client?.getOptions();

    if (!clientOptions?.includeLocalVariables) {
      return;
    }

    // Only setup this integration if the Node version is >= v18
    // https://github.com/getsentry/sentry-javascript/issues/7697
    const unsupportedNodeVersion = NODE_MAJOR < 18;

    if (unsupportedNodeVersion) {
      debug.log('The `LocalVariables` integration is only supported on Node >= v18.');
      return;
    }

    if (await isDebuggerEnabled()) {
      debug.warn('Local variables capture has been disabled because the debugger was already enabled');
      return;
    }

    try {
      const session = await AsyncSession.create(sessionOverride);

      const handlePaused = (
        stackParser: StackParser,
        { params: { reason, data, callFrames } }: InspectorNotification<PausedExceptionEvent>,
        complete: () => void,
      ): void => {
        if (reason !== 'exception' && reason !== 'promiseRejection') {
          complete();
          return;
        }

        rateLimiter?.();

        // data.description contains the original error.stack
        const exceptionHash = hashFromStack(stackParser, data.description);

        if (exceptionHash == undefined) {
          complete();
          return;
        }

        const { add, next } = createCallbackList<FrameVariables[]>(frames => {
          cachedFrames.set(exceptionHash, frames);
          complete();
        });

        // Because we're queuing up and making all these calls synchronously, we can potentially overflow the stack
        // For this reason we only attempt to get local variables for the first 5 frames
        for (let i = 0; i < Math.min(callFrames.length, 5); i++) {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          const { scopeChain, functionName, this: obj } = callFrames[i]!;

          const localScope = scopeChain.find(scope => scope.type === 'local');

          // obj.className is undefined in ESM modules
          const fn = obj.className === 'global' || !obj.className ? functionName : `${obj.className}.${functionName}`;

          if (localScope?.object.objectId === undefined) {
            add(frames => {
              frames[i] = { function: fn };
              next(frames);
            });
          } else {
            const id = localScope.object.objectId;
            add(frames =>
              session.getLocalVariables(id, vars => {
                frames[i] = { function: fn, vars };
                next(frames);
              }),
            );
          }
        }

        next([]);
      };

      const captureAll = options.captureAllExceptions !== false;

      session.configureAndConnect(
        (ev, complete) =>
          handlePaused(clientOptions.stackParser, ev as InspectorNotification<PausedExceptionEvent>, complete),
        captureAll,
      );

      if (captureAll) {
        const max = options.maxExceptionsPerSecond || 50;

        rateLimiter = createRateLimiter(
          max,
          () => {
            debug.log('Local variables rate-limit lifted.');
            session.setPauseOnExceptions(true);
          },
          seconds => {
            debug.log(
              `Local variables rate-limit exceeded. Disabling capturing of caught exceptions for ${seconds} seconds.`,
            );
            session.setPauseOnExceptions(false);
          },
        );
      }

      shouldProcessEvent = true;
    } catch (error) {
      debug.log('The `LocalVariables` integration failed to start.', error);
    }
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      setupPromise = setup();
    },
    async processEvent(event: Event): Promise<Event> {
      await setupPromise;

      if (shouldProcessEvent) {
        return addLocalVariablesToEvent(event);
      }

      return event;
    },
    // These are entirely for testing
    _getCachedFramesCount(): number {
      return cachedFrames.size;
    },
    _getFirstCachedFrame(): FrameVariables[] | undefined {
      return cachedFrames.values()[0];
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds local variables to exception frames.
 */
export const localVariablesSyncIntegration = defineIntegration(_localVariablesSyncIntegration);
