import type { Session } from 'node:inspector/promises';
import { convertIntegrationFnToClass, defineIntegration } from '@sentry/core';
import type { Event, Exception, Integration, IntegrationClass, IntegrationFn, StackParser } from '@sentry/types';
import { LRUMap, dynamicRequire, logger } from '@sentry/utils';
import type { Debugger, InspectorNotification, Runtime } from 'inspector';

import type { NodeClient } from '../../client';
import type { NodeClientOptions } from '../../types';
import type {
  FrameVariables,
  LocalVariablesIntegrationOptions,
  PausedExceptionEvent,
  RateLimitIncrement,
  Variables,
} from './common';
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
  if (!prop.value) {
    return;
  }

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
    } else if (prop?.value) {
      unrollOther(prop, variables);
    }
  }

  return variables;
}

const INTEGRATION_NAME = 'LocalVariablesAsync';

/**
 * Adds local variables to exception frames
 */
const _localVariablesAsyncIntegration = ((options: LocalVariablesIntegrationOptions = {}) => {
  const cachedFrames: LRUMap<string, FrameVariables[]> = new LRUMap(20);
  let rateLimiter: RateLimitIncrement | undefined;
  let shouldProcessEvent = false;

  async function handlePaused(
    session: Session,
    stackParser: StackParser,
    { reason, data, callFrames }: PausedExceptionEvent,
  ): Promise<void> {
    if (reason !== 'exception' && reason !== 'promiseRejection') {
      return;
    }

    rateLimiter?.();

    // data.description contains the original error.stack
    const exceptionHash = hashFromStack(stackParser, data?.description);

    if (exceptionHash == undefined) {
      return;
    }

    const frames = [];

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

    cachedFrames.set(exceptionHash, frames);
  }

  async function startDebugger(session: Session, clientOptions: NodeClientOptions): Promise<void> {
    session.connect();

    let isPaused = false;

    session.on('Debugger.resumed', () => {
      isPaused = false;
    });

    session.on('Debugger.paused', (event: InspectorNotification<Debugger.PausedEventDataType>) => {
      isPaused = true;

      handlePaused(session, clientOptions.stackParser, event.params as PausedExceptionEvent).then(
        () => {
          // After the pause work is complete, resume execution!
          return isPaused ? session.post('Debugger.resume') : Promise.resolve();
        },
        _ => {
          // ignore
        },
      );
    });

    await session.post('Debugger.enable');

    const captureAll = options.captureAllExceptions !== false;
    await session.post('Debugger.setPauseOnExceptions', { state: captureAll ? 'all' : 'uncaught' });

    if (captureAll) {
      const max = options.maxExceptionsPerSecond || 50;

      rateLimiter = createRateLimiter(
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

    shouldProcessEvent = true;
  }

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

    const frameCount = exception.stacktrace?.frames?.length || 0;

    for (let i = 0; i < frameCount; i++) {
      // Sentry frames are in reverse order
      const frameIndex = frameCount - i - 1;

      // Drop out if we run out of frames to match up
      if (!exception.stacktrace?.frames?.[frameIndex] || !cachedFrame[i]) {
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
    for (const exception of event.exception?.values || []) {
      addLocalVariablesToException(exception);
    }

    return event;
  }

  return {
    name: INTEGRATION_NAME,
    setup(client: NodeClient) {
      const clientOptions = client.getOptions();

      if (!clientOptions.includeLocalVariables) {
        return;
      }

      try {
        // TODO: Use import()...
        // It would be nice to use import() here, but this built-in library is not in Node <19 so webpack will pick it
        // up and report it as a missing dependency
        const { Session } = dynamicRequire(module, 'node:inspector/promises');

        startDebugger(new Session(), clientOptions).catch(e => {
          logger.error('Failed to start inspector session', e);
        });
      } catch (e) {
        logger.error('Failed to load inspector API', e);
        return;
      }
    },
    processEvent(event: Event): Event {
      if (shouldProcessEvent) {
        return addLocalVariablesToEvent(event);
      }

      return event;
    },
  };
}) satisfies IntegrationFn;

export const localVariablesAsyncIntegration = defineIntegration(_localVariablesAsyncIntegration);

/**
 * Adds local variables to exception frames.
 * @deprecated Use `localVariablesAsyncIntegration()` instead.
 */
// eslint-disable-next-line deprecation/deprecation
export const LocalVariablesAsync = convertIntegrationFnToClass(
  INTEGRATION_NAME,
  localVariablesAsyncIntegration,
) as IntegrationClass<Integration & { processEvent: (event: Event) => Event; setup: (client: NodeClient) => void }>;

// eslint-disable-next-line deprecation/deprecation
export type LocalVariablesAsync = typeof LocalVariablesAsync;
