import { parseSemver } from '@sentry/utils';

const nodeVersion = parseSemver(process.versions.node);

if ((nodeVersion.major || 0) < 14) {
  throw new Error('The LocalVariables integration requires node.js >= v14');
}

import { Event, EventProcessor, Hub, Integration, StackFrame, StackParser } from '@sentry/types';
import { Debugger, InspectorNotification, Runtime, Session } from 'inspector';
import { LRUMap } from 'lru_map';

interface ExceptionData {
  description: string;
}

interface FrameVars {
  function: string;
  vars?: Record<string, unknown>;
}

/**
 * Creates a unique hash from the stack frames
 */
function hashFrames(frames: StackFrame[] | undefined): string | undefined {
  if (frames === undefined) {
    return;
  }

  return frames.reduce((acc, frame) => `${acc},${frame.function},${frame.lineno},${frame.colno}`, '');
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

/**
 * Adds local variables to exception frames
 */
export class LocalVariables implements Integration {
  public static id: string = 'LocalVariables';

  public name: string = LocalVariables.id;

  private readonly _session: AsyncSession;
  private readonly _cachedFrameVars: LRUMap<string, Promise<FrameVars[]>> = new LRUMap(50);
  // We use the stack parser to create a unique hash from the exception stack trace
  // This is used to lookup vars when
  private _stackParser: StackParser | undefined;

  public constructor() {
    this._session = new AsyncSession();
    this._session.connect();
    this._session.on('Debugger.paused', this._handlePaused.bind(this));
    this._session.post('Debugger.enable');
    // We only care about uncaught exceptions
    this._session.post('Debugger.setPauseOnExceptions', { state: 'uncaught' });
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    this._stackParser = getCurrentHub().getClient()?.getOptions().stackParser;

    addGlobalEventProcessor(async event => this._addLocalVariables(event));
  }

  /**
   * Handle the pause event
   */
  private async _handlePaused(event: InspectorNotification<Debugger.PausedEventDataType>): Promise<void> {
    // We only care about exceptions for now
    if (event.params.reason !== 'exception') {
      return;
    }

    const exceptionData = event.params?.data as ExceptionData | undefined;

    // event.params.data.description contains the original error.stack
    const exceptionHash =
      exceptionData?.description && this._stackParser
        ? hashFrames(this._stackParser(exceptionData.description, 1))
        : undefined;

    if (exceptionHash == undefined) {
      return;
    }

    // We add the un-awaited promise to the cache rather than await here otherwise the event processor
    // can be called before we're finished getting all the vars
    const framesPromise: Promise<FrameVars[]> = Promise.all(
      event.params.callFrames.map(async callFrame => {
        const localScope = callFrame.scopeChain.find(scope => scope.type === 'local');

        if (localScope?.object.objectId) {
          const vars = await this._unrollProps(await this._session.getProperties(localScope.object.objectId));

          const fn =
            callFrame.this.className !== 'global'
              ? `${callFrame.this.className}.${callFrame.functionName}`
              : callFrame.functionName;

          return { function: fn, vars };
        }

        return { function: callFrame.functionName };
      }),
    );

    this._cachedFrameVars.set(exceptionHash, framesPromise);
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
    const cachedFrameVars = await this._cachedFrameVars.get(hash);

    if (cachedFrameVars === undefined) {
      return event;
    }

    const frameCount = event?.exception?.values?.[0]?.stacktrace?.frames?.length || 0;

    for (let i = 0; i < frameCount; i++) {
      const frameIndex = frameCount - i - 1;

      // Drop out if we run out of frames to match
      if (!event?.exception?.values?.[0]?.stacktrace?.frames?.[frameIndex] || !cachedFrameVars[i]) {
        break;
      }

      if (
        // We're not interested in frames that are not in_app because the vars are not relevant
        event.exception.values[0].stacktrace.frames[frameIndex].in_app === false ||
        // The function names need to match
        event.exception.values[0].stacktrace.frames[frameIndex].function !== cachedFrameVars[i].function ||
        // We need to have vars to add
        cachedFrameVars[i].vars === undefined
      ) {
        continue;
      }

      event.exception.values[0].stacktrace.frames[frameIndex].vars = cachedFrameVars[i].vars;
    }

    return event;
  }
}
