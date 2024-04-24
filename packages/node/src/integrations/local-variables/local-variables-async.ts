import { defineIntegration } from '@sentry/core';
import type { Event, Exception, IntegrationFn } from '@sentry/types';
import { LRUMap, logger } from '@sentry/utils';
import { Worker } from 'worker_threads';

import type { NodeClient } from '../../sdk/client';
import type { FrameVariables, LocalVariablesIntegrationOptions, LocalVariablesWorkerArgs } from './common';
import { functionNamesMatch, hashFrames } from './common';

// This string is a placeholder that gets overwritten with the worker code.
export const base64WorkerScript = '###LocalVariablesWorkerScript###';

function log(...args: unknown[]): void {
  logger.log('[LocalVariables]', ...args);
}

/**
 * Adds local variables to exception frames
 */
export const localVariablesAsyncIntegration = defineIntegration(((
  integrationOptions: LocalVariablesIntegrationOptions = {},
) => {
  const cachedFrames: LRUMap<string, FrameVariables[]> = new LRUMap(20);

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

    // Filter out frames where the function name is `new Promise` since these are in the error.stack frames
    // but do not appear in the debugger call frames
    const frames = (exception.stacktrace?.frames || []).filter(frame => frame.function !== 'new Promise');

    for (let i = 0; i < frames.length; i++) {
      // Sentry frames are in reverse order
      const frameIndex = frames.length - i - 1;

      // Drop out if we run out of frames to match up
      if (!frames[frameIndex] || !cachedFrame[i]) {
        break;
      }

      if (
        // We need to have vars to add
        cachedFrame[i].vars === undefined ||
        // We're not interested in frames that are not in_app because the vars are not relevant
        frames[frameIndex].in_app === false ||
        // The function names need to match
        !functionNamesMatch(frames[frameIndex].function, cachedFrame[i].function)
      ) {
        continue;
      }

      frames[frameIndex].vars = cachedFrame[i].vars;
    }
  }

  function addLocalVariablesToEvent(event: Event): Event {
    for (const exception of event.exception?.values || []) {
      addLocalVariablesToException(exception);
    }

    return event;
  }

  async function startInspector(): Promise<void> {
    // We load inspector dynamically because on some platforms Node is built without inspector support
    const inspector = await import('inspector');
    if (!inspector.url()) {
      inspector.open(0);
    }
  }

  function startWorker(options: LocalVariablesWorkerArgs): void {
    const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
      workerData: options,
    });

    process.on('exit', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      worker.terminate();
    });

    worker.on('message', ({ exceptionHash, frames }) => {
      cachedFrames.set(exceptionHash, frames);
    });

    worker.once('error', (err: Error) => {
      log('Worker error', err);
    });

    worker.once('exit', (code: number) => {
      log('Worker exit', code);
    });

    // Ensure this thread can't block app exit
    worker.unref();
  }

  return {
    name: 'LocalVariablesAsync',
    setup(client: NodeClient) {
      const clientOptions = client.getOptions();

      if (!clientOptions.includeLocalVariables) {
        return;
      }

      const options: LocalVariablesWorkerArgs = {
        ...integrationOptions,
        debug: logger.isEnabled(),
      };

      startInspector().then(
        () => {
          try {
            startWorker(options);
          } catch (e) {
            logger.error('Failed to start worker', e);
          }
        },
        e => {
          logger.error('Failed to start inspector', e);
        },
      );
    },
    processEvent(event: Event): Event {
      return addLocalVariablesToEvent(event);
    },
  };
}) satisfies IntegrationFn);
