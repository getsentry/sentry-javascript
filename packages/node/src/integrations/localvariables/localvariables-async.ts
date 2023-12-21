import type { Session } from 'node:inspector/promises';
import type { Event, EventProcessor, Exception, Hub, Integration, StackFrame, StackParser } from '@sentry/types';
import { LRUMap, logger } from '@sentry/utils';
import type { Runtime } from 'inspector';
import type { NodeClient } from '../../client';

import type { NodeClientOptions } from '../../types';
import type { FrameVariables, Options, PausedExceptionEvent, RateLimitIncrement, Variables } from './common';
import { createRateLimiter, functionNamesMatch, hashFrames, hashFromStack } from './common';

async function unrollArray(session: Session, objectId: string, name: string, vars: Variables): Promise<void> {
  const properties: Runtime.GetPropertiesReturnType = await session.post('Runtime.getProperties', {
    objectId,
    ownProperties: true,
  });

  vars[name] = properties.result
    .filter(v => v.name !== 'length' && !isNaN(parseInt(v.name, 10)))
    .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
    .map(v => v.value?.value);
}

async function unrollObject(session: Session, objectId: string, name: string, vars: Variables): Promise<void> {
  const properties: Runtime.GetPropertiesReturnType = await session.post('Runtime.getProperties', {
    objectId,
    ownProperties: true,
  });

  vars[name] = properties.result
    .map<[string, unknown]>(v => [v.name, v.value?.value])
    .reduce((obj, [key, val]) => {
      obj[key] = val;
      return obj;
    }, {} as Variables);
}

function unrollOther(prop: Runtime.PropertyDescriptor, vars: Variables): void {
  if (prop?.value?.value) {
    vars[prop.name] = prop.value.value;
  } else if (prop?.value?.description && prop?.value?.type !== 'function') {
    vars[prop.name] = `<${prop.value.description}>`;
  }
}

async function getLocalVariables(session: Session, objectId: string): Promise<Variables> {
  const properties: Runtime.GetPropertiesReturnType = await session.post('Runtime.getProperties', {
    objectId,
    ownProperties: true,
  });
  const variables = {};

  for (const prop of properties.result) {
    if (prop?.value?.objectId && prop?.value.className === 'Array') {
      const id = prop.value.objectId;
      await unrollArray(session, id, prop.name, variables);
    } else if (prop?.value?.objectId && prop?.value?.className === 'Object') {
      const id = prop.value.objectId;
      await unrollObject(session, id, prop.name, variables);
    } else if (prop?.value?.value || prop?.value?.description) {
      unrollOther(prop, variables);
    }
  }

  return variables;
}

/**
 * Adds local variables to exception frames
 *
 * Default: 50
 */
export class LocalVariablesAsync implements Integration {
  public static id: string = 'LocalVariablesAsync';

  public readonly name: string = LocalVariablesAsync.id;

  private readonly _cachedFrames: LRUMap<string, FrameVariables[]> = new LRUMap(20);
  private _rateLimiter: RateLimitIncrement | undefined;
  private _shouldProcessEvent = false;

  public constructor(private readonly _options: Options = {}) {}

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    // noop
  }

  /** @inheritdoc */
  public setup(client: NodeClient): void {
    const clientOptions = client.getOptions();

    if (!clientOptions.includeLocalVariables) {
      return;
    }

    import('node:inspector/promises')
      .then(({ Session }) => this._startDebugger(new Session(), clientOptions))
      .catch(e => logger.error('Failed to load inspector API', e));
  }

  /** @inheritdoc */
  public processEvent(event: Event): Event {
    if (this._shouldProcessEvent) {
      return this._addLocalVariables(event);
    }

    return event;
  }

  /** Start and configures the debugger to capture local variables */
  private async _startDebugger(session: Session, options: NodeClientOptions): Promise<void> {
    session.connect();

    let isPaused = false;

    session.on('Debugger.resumed', () => {
      isPaused = false;
    });

    session.on('Debugger.paused', async event => {
      isPaused = true;

      this._handlePaused(session, options.stackParser, event.params as PausedExceptionEvent)
        .then(async () => {
          if (isPaused) {
            // After the pause work is complete, resume execution or the exception context memory is leaked
            await session.post('Debugger.resume');
          }
        })
        .catch(_ => {
          //
        });
    });

    await session.post('Debugger.enable');

    const captureAll = this._options.captureAllExceptions !== false;
    await session.post('Debugger.setPauseOnExceptions', { state: captureAll ? 'all' : 'uncaught' });

    if (captureAll) {
      const max = this._options.maxExceptionsPerSecond || 50;

      this._rateLimiter = createRateLimiter(
        max,
        () => {
          logger.log('Local variables rate-limit lifted.');
          return session.post('Debugger.setPauseOnExceptions', { state: 'all' });
        },
        seconds => {
          logger.log(
            `Local variables rate-limit exceeded. Disabling capturing of caught exceptions for ${seconds} seconds.`,
          );
          return session.post('Debugger.setPauseOnExceptions', { state: 'uncaught' });
        },
      );
    }

    this._shouldProcessEvent = true;
  }

  /**
   * Handle the pause event
   */
  private async _handlePaused(
    session: Session,
    stackParser: StackParser,
    { reason, data, callFrames }: PausedExceptionEvent,
  ): Promise<void> {
    if (reason !== 'exception' && reason !== 'promiseRejection') {
      return;
    }

    this._rateLimiter?.();

    // data.description contains the original error.stack
    const exceptionHash = hashFromStack(stackParser, data?.description);

    if (exceptionHash == undefined) {
      return;
    }

    const frames = [];

    // Because we're queuing up and making all these calls synchronously, we can potentially overflow the stack
    // For this reason we only attempt to get local variables for the first 5 frames
    for (let i = 0; i < callFrames.length; i++) {
      const { scopeChain, functionName, this: obj } = callFrames[i];

      const localScope = scopeChain.find(scope => scope.type === 'local');

      // obj.className is undefined in ESM modules
      const fn = obj.className === 'global' || !obj.className ? functionName : `${obj.className}.${functionName}`;

      if (localScope?.object.objectId === undefined) {
        frames[i] = { function: fn };
      } else {
        const vars = await getLocalVariables(session, localScope.object.objectId);
        frames[i] = { function: fn, vars };
      }
    }

    this._cachedFrames.set(exceptionHash, frames);
  }

  /**
   * Adds local variables event stack frames.
   */
  private _addLocalVariables(event: Event): Event {
    for (const exception of event.exception?.values || []) {
      this._addLocalVariablesToException(exception);
    }

    return event;
  }

  /**
   * Adds local variables to the exception stack frames.
   */
  private _addLocalVariablesToException(exception: Exception): void {
    const hash = hashFrames(exception.stacktrace?.frames);

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
      if (!exception.stacktrace?.frames?.[frameIndex] || !cachedFrames[i]) {
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
