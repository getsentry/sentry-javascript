import { captureNitroTaskError } from './captureErrors';
import type { NitroTaskRegistry } from './nitroTypes';

/**
 * Wraps the `run` function of every registered Nitro task to capture errors it throws.
 *
 * Nitro's scheduler catches task errors and only logs them, so they never reach the `error` hook.
 */
export function instrumentNitroTasks(tasks: NitroTaskRegistry): void {
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
        run: async (event: unknown) => {
          try {
            return await handler.run(event);
          } catch (error) {
            await captureNitroTaskError(error, name);
            throw error;
          }
        },
      };
    };
  }
}
