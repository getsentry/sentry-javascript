/* eslint-disable max-lines */
import type { Event, EventProcessor, Exception, Hub, Integration, StackParser } from '@sentry/types';
import { LRUMap, logger } from '@sentry/utils';
import type { Debugger, InspectorNotification, Runtime, Session } from 'inspector';
import type { NodeClient } from '../../client';

import { NODE_VERSION } from '../../nodeVersion';
import type { FrameVariables, Options, PausedExceptionEvent, RateLimitIncrement, Variables } from './common';
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
    /*
    TODO: We really should get rid of this require statement below for a couple of reasons:
    1. It makes the integration unusable in the SvelteKit SDK, as it's not possible to use `require`
       in SvelteKit server code (at least not by default).
    2. Throwing in a constructor is bad practice

    More context for a future attempt to fix this:
    We already tried replacing it with import but didn't get it to work because of async problems.
    We still called import in the constructor but assigned to a promise which we "awaited" in
    `configureAndConnect`. However, this broke the Node integration tests as no local variables
    were reported any more. We probably missed a place where we need to await the promise, too.
    */

    // Node can be built without inspector support so this can throw
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Session } = require('inspector');
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
        } else if (prop?.value?.value || prop?.value?.description) {
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
    if (prop?.value?.value) {
      vars[prop.name] = prop.value.value;
    } else if (prop?.value?.description && prop?.value?.type !== 'function') {
      vars[prop.name] = `<${prop.value.description}>`;
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

/**
 * Adds local variables to exception frames
 */
export class LocalVariablesSync implements Integration {
  public static id: string = 'LocalVariablesSync';

  public readonly name: string = LocalVariablesSync.id;

  private readonly _cachedFrames: LRUMap<string, FrameVariables[]> = new LRUMap(20);
  private _rateLimiter: RateLimitIncrement | undefined;
  private _shouldProcessEvent = false;

  public constructor(
    private readonly _options: Options = {},
    private readonly _session: DebugSession | undefined = tryNewAsyncSession(),
  ) {}

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // noop
  }

  /** @inheritdoc */
  public setup(client: NodeClient): void {
    const clientOptions = client.getOptions();

    if (this._session && clientOptions.includeLocalVariables) {
      // Only setup this integration if the Node version is >= v18
      // https://github.com/getsentry/sentry-javascript/issues/7697
      const unsupportedNodeVersion = NODE_VERSION.major < 18;

      if (unsupportedNodeVersion) {
        logger.log('The `LocalVariables` integration is only supported on Node >= v18.');
        return;
      }

      const captureAll = this._options.captureAllExceptions !== false;

      this._session.configureAndConnect(
        (ev, complete) =>
          this._handlePaused(clientOptions.stackParser, ev as InspectorNotification<PausedExceptionEvent>, complete),
        captureAll,
      );

      if (captureAll) {
        const max = this._options.maxExceptionsPerSecond || 50;

        this._rateLimiter = createRateLimiter(
          max,
          () => {
            logger.log('Local variables rate-limit lifted.');
            this._session?.setPauseOnExceptions(true);
          },
          seconds => {
            logger.log(
              `Local variables rate-limit exceeded. Disabling capturing of caught exceptions for ${seconds} seconds.`,
            );
            this._session?.setPauseOnExceptions(false);
          },
        );
      }

      this._shouldProcessEvent = true;
    }
  }

  /** @inheritdoc */
  public processEvent(event: Event): Event {
    if (this._shouldProcessEvent) {
      return this._addLocalVariables(event);
    }

    return event;
  }

  /**
   * Handle the pause event
   */
  private _handlePaused(
    stackParser: StackParser,
    { params: { reason, data, callFrames } }: InspectorNotification<PausedExceptionEvent>,
    complete: () => void,
  ): void {
    if (reason !== 'exception' && reason !== 'promiseRejection') {
      complete();
      return;
    }

    this._rateLimiter?.();

    // data.description contains the original error.stack
    const exceptionHash = hashFromStack(stackParser, data?.description);

    if (exceptionHash == undefined) {
      complete();
      return;
    }

    const { add, next } = createCallbackList<FrameVariables[]>(frames => {
      this._cachedFrames.set(exceptionHash, frames);
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
          this._session?.getLocalVariables(id, vars => {
            frames[i] = { function: fn, vars };
            next(frames);
          }),
        );
      }
    }

    next([]);
  }

  /**
   * Adds local variables event stack frames.
   */
  private _addLocalVariables(event: Event): Event {
    for (const exception of event?.exception?.values || []) {
      this._addLocalVariablesToException(exception);
    }

    return event;
  }

  /**
   * Adds local variables to the exception stack frames.
   */
  private _addLocalVariablesToException(exception: Exception): void {
    const hash = hashFrames(exception?.stacktrace?.frames);

    if (hash === undefined) {
      return;
    }

    // Check if we have local variables for an exception that matches the hash
    // remove is identical to get but also removes the entry from the cache
    const cachedFrames = this._cachedFrames.remove(hash);

    if (cachedFrames === undefined) {
      return;
    }

    const frameCount = exception.stacktrace?.frames?.length || 0;

    for (let i = 0; i < frameCount; i++) {
      // Sentry frames are in reverse order
      const frameIndex = frameCount - i - 1;

      // Drop out if we run out of frames to match up
      if (!exception?.stacktrace?.frames?.[frameIndex] || !cachedFrames[i]) {
        break;
      }

      if (
        // We need to have vars to add
        cachedFrames[i].vars === undefined ||
        // We're not interested in frames that are not in_app because the vars are not relevant
        exception.stacktrace.frames[frameIndex].in_app === false ||
        // The function names need to match
        !functionNamesMatch(exception.stacktrace.frames[frameIndex].function, cachedFrames[i].function)
      ) {
        continue;
      }

      exception.stacktrace.frames[frameIndex].vars = cachedFrames[i].vars;
    }
  }
}
