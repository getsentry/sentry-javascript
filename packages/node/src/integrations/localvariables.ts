import { getCurrentHub } from '@sentry/core';
import { Event, EventProcessor, Integration, StackFrame, StackParser } from '@sentry/types';
import { Debugger, InspectorNotification, Runtime, Session } from 'inspector';
import { LRUMap } from 'lru_map';

import { NodeClient } from '../client';

/**
 * Promise API is available as `Experimental` and in Node 19 only.
 *
 * Callback-based API is `Stable` since v14 and `Experimental` since v8.
 * Because of that, we are creating our own `AsyncSession` class.
 *
 * https://nodejs.org/docs/latest-v19.x/api/inspector.html#promises-api
 * https://nodejs.org/docs/latest-v14.x/api/inspector.html
 */
class AsyncSession extends Session {
  public async getProperties(objectId: string): Promise<Runtime.PropertyDescriptor[]> {
    return new Promise((resolve, reject) => {
      this.post(
        'Runtime.getProperties',
        {
          objectId,
          ownProperties: true,
        },
        (err, params) => {
          if (err) {
            reject(err);
          } else {
            resolve(params.result);
          }
        },
      );
    });
  }
}

// Add types for the exception event data
type PausedExceptionEvent = Debugger.PausedEventDataType & {
  data: {
    // This contains error.stack
    description: string;
  };
};

/** Could this be an anonymous function? */
function isAnonymous(name: string | undefined): boolean {
  return !!name && ['', '?', '<anonymous>'].includes(name);
}

/** Do the function names appear to match? */
function functionNamesMatch(a: string | undefined, b: string | undefined): boolean {
  return a === b || (isAnonymous(a) && isAnonymous(b));
}

/** Creates a unique hash from stack frames */
function hashFrames(frames: StackFrame[] | undefined): string | undefined {
  if (frames === undefined) {
    return;
  }

  return frames.reduce((acc, frame) => `${acc},${frame.function},${frame.lineno},${frame.colno}`, '');
}

type HashFromStackFn = (stack: string | undefined) => string | undefined;

/**
 * Creates a function used to hash stack strings
 *
 * We use the stack parser to create a unique hash from the exception stack trace
 * This is used to lookup vars when the exception passes through the event processor
 */
function createHashFn(stackParser: StackParser | undefined): HashFromStackFn {
  return (stack: string | undefined) => {
    if (stackParser === undefined || stack === undefined) {
      return undefined;
    }

    return hashFrames(stackParser(stack, 1));
  };
}

interface FrameVariables {
  function: string;
  vars?: Record<string, unknown>;
}

/**
 * Adds local variables to exception frames
 */
export class LocalVariables implements Integration {
  public static id: string = 'LocalVariables';

  public readonly name: string = LocalVariables.id;

  private readonly _session: AsyncSession = new AsyncSession();
  private readonly _cachedFrames: LRUMap<string, Promise<FrameVariables[]>> = new LRUMap(50);

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    const options = getCurrentHub().getClient<NodeClient>()?.getOptions();

    if (options?.includeStackLocals) {
      this._stackHasher = createHashFn(options.stackParser);
      addGlobalEventProcessor(async event => this._addLocalVariables(event));

      this._session.connect();
      this._session.on('Debugger.paused', this._handlePaused.bind(this));
      this._session.post('Debugger.enable');
      // We only want to pause on uncaught exceptions
      this._session.post('Debugger.setPauseOnExceptions', { state: 'uncaught' });
    }
  }

  /**
   * We use the stack parser to create a unique hash from the exception stack trace
   * This is used to lookup vars when the event processor is called
   */
  private _stackHasher: HashFromStackFn = _ => undefined;

  /**
   * Handle the pause event
   */
  private async _handlePaused({
    params: { reason, data, callFrames },
  }: InspectorNotification<PausedExceptionEvent>): Promise<void> {
    if (reason !== 'exception' && reason !== 'promiseRejection') {
      return;
    }

    // data.description contains the original error.stack
    const exceptionHash = this._stackHasher(data?.description);

    if (exceptionHash == undefined) {
      return;
    }

    const framePromises = callFrames.map(async ({ scopeChain, functionName, this: obj }) => {
      const localScope = scopeChain.find(scope => scope.type === 'local');

      const fn = obj.className !== 'global' ? `${obj.className}.${functionName}` : functionName;

      if (localScope?.object.objectId === undefined) {
        return { function: fn };
      }

      const vars = await this._unrollProps(await this._session.getProperties(localScope.object.objectId));

      return { function: fn, vars };
    });

    // We add the un-awaited promise to the cache rather than await here otherwise the event processor
    // can be called before we're finished getting all the vars
    this._cachedFrames.set(exceptionHash, Promise.all(framePromises));
  }

  /**
   * Unrolls all the properties
   */
  private async _unrollProps(props: Runtime.PropertyDescriptor[]): Promise<Record<string, unknown>> {
    const unrolled: Record<string, unknown> = {};

    for (const prop of props) {
      if (prop?.value?.objectId && prop?.value.className === 'Array') {
        unrolled[prop.name] = await this._unrollArray(prop.value.objectId);
      } else if (prop?.value?.objectId && prop?.value?.className === 'Object') {
        unrolled[prop.name] = await this._unrollObject(prop.value.objectId);
      } else if (prop?.value?.value || prop?.value?.description) {
        unrolled[prop.name] = prop.value.value || `<${prop.value.description}>`;
      }
    }

    return unrolled;
  }

  /**
   * Unrolls an array property
   */
  private async _unrollArray(objectId: string): Promise<unknown> {
    const props = await this._session.getProperties(objectId);
    return props
      .filter(v => v.name !== 'length')
      .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
      .map(v => v?.value?.value);
  }

  /**
   * Unrolls an object property
   */
  private async _unrollObject(objectId: string): Promise<Record<string, unknown>> {
    const props = await this._session.getProperties(objectId);
    return props
      .map<[string, unknown]>(v => [v.name, v?.value?.value])
      .reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {} as Record<string, unknown>);
  }

  /**
   * Adds local variables to the exception stack trace frames.
   */
  private async _addLocalVariables(event: Event): Promise<Event> {
    const hash = hashFrames(event?.exception?.values?.[0]?.stacktrace?.frames);

    if (hash === undefined) {
      return event;
    }

    // Check if we have local variables for an exception that matches the hash
    const cachedFrames = await this._cachedFrames.get(hash);

    if (cachedFrames === undefined) {
      return event;
    }

    const frameCount = event?.exception?.values?.[0]?.stacktrace?.frames?.length || 0;

    for (let i = 0; i < frameCount; i++) {
      // Sentry frames are already in reverse order
      const frameIndex = frameCount - i - 1;

      // Drop out if we run out of frames to match up
      if (!event?.exception?.values?.[0]?.stacktrace?.frames?.[frameIndex] || !cachedFrames[i]) {
        break;
      }

      if (
        // We need to have vars to add
        cachedFrames[i].vars === undefined ||
        // We're not interested in frames that are not in_app because the vars are not relevant
        event.exception.values[0].stacktrace.frames[frameIndex].in_app === false ||
        // The function names need to match
        !functionNamesMatch(event.exception.values[0].stacktrace.frames[frameIndex].function, cachedFrames[i].function)
      ) {
        continue;
      }

      event.exception.values[0].stacktrace.frames[frameIndex].vars = cachedFrames[i].vars;
    }

    return event;
  }
}
