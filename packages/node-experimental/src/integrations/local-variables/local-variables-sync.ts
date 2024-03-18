import { defineIntegration, getClient } from '@sentry/core';
import type { Event, Exception, IntegrationFn, StackParser } from '@sentry/types';
import { LRUMap, logger } from '@sentry/utils';
import type { Debugger, InspectorNotification, Runtime } from 'inspector';
import { Session } from 'inspector';

import { NODE_MAJOR } from '../../nodeVersion';
import type { NodeClient } from '../../sdk/client';
import type {
  FrameVariables,
  LocalVariablesIntegrationOptions,
  PausedExceptionEvent,
  RateLimitIncrement,
  Variables,
} from './common';
import { createRateLimiter, functionNamesMatch, hashFrames, hashFromStack } from './common';

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
    } catch (_) {
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
  private readonly _session: Session;

  /** Throws if inspector API is not available */
  public constructor() {
    this._session = new Session();
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
        if (prop?.value?.objectId && prop?.value.className === 'Array') {
          const id = prop.value.objectId;
          add(vars => this._unrollArray(id, prop.name, vars, next));
        } else if (prop?.value?.objectId && prop?.value?.className === 'Object') {
          const id = prop.value.objectId;
          add(vars => this._unrollObject(id, prop.name, vars, next));
        } else if (prop?.value) {
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
        .map(v => v?.value?.value);

      next(vars);
    });
  }

  /**
   * Unrolls an object property
   */
  private _unrollObject(objectId: string, name: string, vars: Variables, next: (obj: Variables) => void): void {
    this._getProperties(objectId, props => {
      vars[name] = props
        .map<[string, unknown]>(v => [v.name, v?.value?.value])
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

/**
 * When using Vercel pkg, the inspector module is not available.
 * https://github.com/getsentry/sentry-javascript/issues/6769
 */
function tryNewAsyncSession(): AsyncSession | undefined {
  try {
    return new AsyncSession();
  } catch (e) {
    return undefined;
  }
}

const INTEGRATION_NAME = 'LocalVariables';

/**
 * Adds local variables to exception frames
 */
const _localVariablesSyncIntegration = ((
  options: LocalVariablesIntegrationOptions = {},
  session: DebugSession | undefined = tryNewAsyncSession(),
) => {
  const cachedFrames: LRUMap<string, FrameVariables[]> = new LRUMap(20);
  let rateLimiter: RateLimitIncrement | undefined;
  let shouldProcessEvent = false;

  function handlePaused(
    stackParser: StackParser,
    { params: { reason, data, callFrames } }: InspectorNotification<PausedExceptionEvent>,
    complete: () => void,
  ): void {
    if (reason !== 'exception' && reason !== 'promiseRejection') {
      complete();
      return;
    }

    rateLimiter?.();

    // data.description contains the original error.stack
    const exceptionHash = hashFromStack(stackParser, data?.description);

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
      const { scopeChain, functionName, this: obj } = callFrames[i];

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
          session?.getLocalVariables(id, vars => {
            frames[i] = { function: fn, vars };
            next(frames);
          }),
        );
      }
    }

    next([]);
  }

  function addLocalVariablesToException(exception: Exception): void {
    const hash = hashFrames(exception?.stacktrace?.frames);

    if (hash === undefined) {
      return;
    }

    // Check if we have local variables for an exception that matches the hash
    // remove is identical to get but also removes the entry from the cache
    const cachedFrame = cachedFrames.remove(hash);

    if (cachedFrame === undefined) {
      return;
    }

    const frameCount = exception.stacktrace?.frames?.length || 0;

    for (let i = 0; i < frameCount; i++) {
      // Sentry frames are in reverse order
      const frameIndex = frameCount - i - 1;

      // Drop out if we run out of frames to match up
      if (!exception?.stacktrace?.frames?.[frameIndex] || !cachedFrame[i]) {
        break;
      }

      if (
        // We need to have vars to add
        cachedFrame[i].vars === undefined ||
        // We're not interested in frames that are not in_app because the vars are not relevant
        exception.stacktrace.frames[frameIndex].in_app === false ||
        // The function names need to match
        !functionNamesMatch(exception.stacktrace.frames[frameIndex].function, cachedFrame[i].function)
      ) {
        continue;
      }

      exception.stacktrace.frames[frameIndex].vars = cachedFrame[i].vars;
    }
  }

  function addLocalVariablesToEvent(event: Event): Event {
    for (const exception of event?.exception?.values || []) {
      addLocalVariablesToException(exception);
    }

    return event;
  }

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      const client = getClient<NodeClient>();
      const clientOptions = client?.getOptions();

      if (session && clientOptions?.includeLocalVariables) {
        // Only setup this integration if the Node version is >= v18
        // https://github.com/getsentry/sentry-javascript/issues/7697
        const unsupportedNodeVersion = NODE_MAJOR < 18;

        if (unsupportedNodeVersion) {
          logger.log('The `LocalVariables` integration is only supported on Node >= v18.');
          return;
        }

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
              logger.log('Local variables rate-limit lifted.');
              session?.setPauseOnExceptions(true);
            },
            seconds => {
              logger.log(
                `Local variables rate-limit exceeded. Disabling capturing of caught exceptions for ${seconds} seconds.`,
              );
              session?.setPauseOnExceptions(false);
            },
          );
        }

        shouldProcessEvent = true;
      }
    },
    processEvent(event: Event): Event {
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
