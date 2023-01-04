import type {
  ClientOptions,
  Event,
  EventProcessor,
  Exception,
  Hub,
  Integration,
  StackFrame,
  StackParser,
} from '@sentry/types';
import type { Debugger, InspectorNotification, Runtime } from 'inspector';
import { Session } from 'inspector';
import { LRUMap } from 'lru_map';

export interface DebugSession {
  /** Configures and connects to the debug session */
  configureAndConnect(onPause: (message: InspectorNotification<Debugger.PausedEventDataType>) => void): void;
  /** Gets local variables for an objectId */
  getLocalVariables(objectId: string): Promise<Record<string, unknown>>;
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
class AsyncSession extends Session implements DebugSession {
  /** @inheritdoc */
  public configureAndConnect(onPause: (message: InspectorNotification<Debugger.PausedEventDataType>) => void): void {
    this.connect();
    this.on('Debugger.paused', onPause);
    this.post('Debugger.enable');
    // We only want to pause on uncaught exceptions
    this.post('Debugger.setPauseOnExceptions', { state: 'uncaught' });
  }

  /** @inheritdoc */
  public async getLocalVariables(objectId: string): Promise<Record<string, unknown>> {
    const props = await this._getProperties(objectId);
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
   * Gets all the PropertyDescriptors of an object
   */
  private _getProperties(objectId: string): Promise<Runtime.PropertyDescriptor[]> {
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

  /**
   * Unrolls an array property
   */
  private async _unrollArray(objectId: string): Promise<unknown> {
    const props = await this._getProperties(objectId);
    return props
      .filter(v => v.name !== 'length' && !isNaN(parseInt(v.name, 10)))
      .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
      .map(v => v?.value?.value);
  }

  /**
   * Unrolls an object property
   */
  private async _unrollObject(objectId: string): Promise<Record<string, unknown>> {
    const props = await this._getProperties(objectId);
    return props
      .map<[string, unknown]>(v => [v.name, v?.value?.value])
      .reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {} as Record<string, unknown>);
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
  return name !== undefined && ['', '?', '<anonymous>'].includes(name);
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

  // Only hash the 10 most recent frames (ie. the last 10)
  return frames.slice(-10).reduce((acc, frame) => `${acc},${frame.function},${frame.lineno},${frame.colno}`, '');
}

/**
 * We use the stack parser to create a unique hash from the exception stack trace
 * This is used to lookup vars when the exception passes through the event processor
 */
function hashFromStack(stackParser: StackParser, stack: string | undefined): string | undefined {
  if (stack === undefined) {
    return undefined;
  }

  return hashFrames(stackParser(stack, 1));
}

export interface FrameVariables {
  function: string;
  vars?: Record<string, unknown>;
}

/** There are no options yet. This allows them to be added later without breaking changes */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Options {}

/**
 * Adds local variables to exception frames
 */
export class LocalVariables implements Integration {
  public static id: string = 'LocalVariables';

  public readonly name: string = LocalVariables.id;

  private readonly _cachedFrames: LRUMap<string, Promise<FrameVariables[]>> = new LRUMap(20);

  public constructor(_options: Options = {}, private readonly _session: DebugSession = new AsyncSession()) {}

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._setup(addGlobalEventProcessor, getCurrentHub().getClient()?.getOptions());
  }

  /** Setup in a way that's easier to call from tests */
  private _setup(
    addGlobalEventProcessor: (callback: EventProcessor) => void,
    clientOptions: ClientOptions | undefined,
  ): void {
    if (clientOptions?._experiments?.includeStackLocals) {
      this._session.configureAndConnect(ev =>
        this._handlePaused(clientOptions.stackParser, ev as InspectorNotification<PausedExceptionEvent>),
      );

      addGlobalEventProcessor(async event => this._addLocalVariables(event));
    }
  }

  /**
   * Handle the pause event
   */
  private async _handlePaused(
    stackParser: StackParser,
    { params: { reason, data, callFrames } }: InspectorNotification<PausedExceptionEvent>,
  ): Promise<void> {
    if (reason !== 'exception' && reason !== 'promiseRejection') {
      return;
    }

    // data.description contains the original error.stack
    const exceptionHash = hashFromStack(stackParser, data?.description);

    if (exceptionHash == undefined) {
      return;
    }

    const framePromises = callFrames.map(async ({ scopeChain, functionName, this: obj }) => {
      const localScope = scopeChain.find(scope => scope.type === 'local');

      const fn = obj.className === 'global' ? functionName : `${obj.className}.${functionName}`;

      if (localScope?.object.objectId === undefined) {
        return { function: fn };
      }

      const vars = await this._session.getLocalVariables(localScope.object.objectId);

      return { function: fn, vars };
    });

    // We add the un-awaited promise to the cache rather than await here otherwise the event processor
    // can be called before we're finished getting all the vars
    this._cachedFrames.set(exceptionHash, Promise.all(framePromises));
  }

  /**
   * Adds local variables event stack frames.
   */
  private async _addLocalVariables(event: Event): Promise<Event> {
    for (const exception of event?.exception?.values || []) {
      await this._addLocalVariablesToException(exception);
    }

    return event;
  }

  /**
   * Adds local variables to the exception stack frames.
   */
  private async _addLocalVariablesToException(exception: Exception): Promise<void> {
    const hash = hashFrames(exception?.stacktrace?.frames);

    if (hash === undefined) {
      return;
    }

    // Check if we have local variables for an exception that matches the hash
    // delete is identical to get but also removes the entry from the cache
    const cachedFrames = await this._cachedFrames.delete(hash);

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
