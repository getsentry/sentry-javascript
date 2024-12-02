import { Worker } from 'node:worker_threads';
import type { Event, EventHint, Exception, IntegrationFn } from '@sentry/core';
import { defineIntegration, logger } from '@sentry/core';
import type { NodeClient } from '../../sdk/client';
import type { FrameVariables, LocalVariablesIntegrationOptions, LocalVariablesWorkerArgs } from './common';
import { LOCAL_VARIABLES_KEY, functionNamesMatch } from './common';

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
  function addLocalVariablesToException(exception: Exception, localVariables: FrameVariables[]): void {
    // Filter out frames where the function name is `new Promise` since these are in the error.stack frames
    // but do not appear in the debugger call frames
    const frames = (exception.stacktrace?.frames || []).filter(frame => frame.function !== 'new Promise');

    for (let i = 0; i < frames.length; i++) {
      // Sentry frames are in reverse order
      const frameIndex = frames.length - i - 1;

      const frameLocalVariables = localVariables[i];
      const frame = frames[frameIndex];

      if (!frame || !frameLocalVariables) {
        // Drop out if we run out of frames to match up
        break;
      }

      if (
        // We need to have vars to add
        frameLocalVariables.vars === undefined ||
        // We're not interested in frames that are not in_app because the vars are not relevant
        frame.in_app === false ||
        // The function names need to match
        !functionNamesMatch(frame.function, frameLocalVariables.function)
      ) {
        continue;
      }

      frame.vars = frameLocalVariables.vars;
    }
  }

  function addLocalVariablesToEvent(event: Event, hint: EventHint): Event {
    if (
      hint.originalException &&
      typeof hint.originalException === 'object' &&
      LOCAL_VARIABLES_KEY in hint.originalException &&
      Array.isArray(hint.originalException[LOCAL_VARIABLES_KEY])
    ) {
      for (const exception of event.exception?.values || []) {
        addLocalVariablesToException(exception, hint.originalException[LOCAL_VARIABLES_KEY]);
      }

      hint.originalException[LOCAL_VARIABLES_KEY] = undefined;
    }

    return event;
  }

  async function startInspector(): Promise<void> {
    // We load inspector dynamically because on some platforms Node is built without inspector support
    const inspector = await import('node:inspector');
    if (!inspector.url()) {
      inspector.open(0);
    }
  }

  function startWorker(options: LocalVariablesWorkerArgs): void {
    const worker = new Worker(new URL(`data:application/javascript;base64,${base64WorkerScript}`), {
      workerData: options,
      // We don't want any Node args to be passed to the worker
      execArgv: [],
    });

    process.on('exit', () => {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      worker.terminate();
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
    processEvent(event: Event, hint: EventHint): Event {
      return addLocalVariablesToEvent(event, hint);
    },
  };
}) satisfies IntegrationFn);
