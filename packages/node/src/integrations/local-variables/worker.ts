import { Session } from 'node:inspector/promises';
import type { StackParser } from '@sentry/types';
import { createStackParser, nodeStackLineParser } from '@sentry/utils';
import type { Debugger, InspectorNotification, Runtime } from 'inspector';
import { parentPort, workerData } from 'worker_threads';
import { createGetModuleFromFilename } from '../../utils/module';
import type { LocalVariablesWorkerArgs, PausedExceptionEvent, RateLimitIncrement, Variables } from './common';
import { createRateLimiter, hashFromStack } from './common';

const options: LocalVariablesWorkerArgs = workerData;

const stackParser = createStackParser(nodeStackLineParser(createGetModuleFromFilename(options.basePath)));

function log(...args: unknown[]): void {
  if (options.debug) {
    // eslint-disable-next-line no-console
    console.log('[LocalVariables Worker]', ...args);
  }
}

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

let rateLimiter: RateLimitIncrement | undefined;

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

  parentPort?.postMessage({ exceptionHash, frames });
}

async function startDebugger(): Promise<void> {
  const session = new Session();
  session.connectToMainThread();

  log('Connected to main thread');

  let isPaused = false;

  session.on('Debugger.resumed', () => {
    isPaused = false;
  });

  session.on('Debugger.paused', (event: InspectorNotification<Debugger.PausedEventDataType>) => {
    isPaused = true;

    handlePaused(session, stackParser, event.params as PausedExceptionEvent).then(
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
      async () => {
        log('Rate-limit lifted.');
        await session.post('Debugger.setPauseOnExceptions', { state: 'all' });
      },
      async seconds => {
        log(`Rate-limit exceeded. Disabling capturing of caught exceptions for ${seconds} seconds.`);
        await session.post('Debugger.setPauseOnExceptions', { state: 'uncaught' });
      },
    );
  }
}

startDebugger().catch(e => {
  log('Failed to start debugger', e);
});

setInterval(() => {
  // Stop the worker from exiting
}, 10_000);
