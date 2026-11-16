import { captureException } from '@sentry/core';
import { flushIfServerless } from '@sentry/core/server';
import type { Task } from 'nitro/types';

type TaskRegistry = Record<string, { resolve?: () => Promise<Task> }>;

/**
 * Wraps the `run` function of every registered Nitro task to capture errors it throws.
 *
 * Nitro's scheduler catches task errors and only logs them, so they never reach the `error` hook.
 */
export function instrumentTasks(tasks: TaskRegistry): void {
  for (const [name, task] of Object.entries(tasks)) {
    const originalResolve = task.resolve;
    if (!originalResolve) {
      continue;
    }

    task.resolve = async () => {
      const handler = await originalResolve();
      if (typeof handler?.run !== 'function') {
        return handler;
      }

      // `resolve` returns the same cached module object on every call, so return a copy instead of wrapping `run` again.
      return {
        ...handler,
        run: async event => {
          try {
            return await handler.run(event);
          } catch (error) {
            captureException(error, {
              captureContext: { contexts: { nitro: { task: name } } },
              mechanism: { handled: false, type: 'auto.function.nitro.task' },
            });
            await flushIfServerless();
            throw error;
          }
        },
      };
    };
  }
}
