import { captureNitroRequestError } from './captureErrors';
import { instrumentNitroTasks } from './instrumentTasks';
import type { NitroAppLike, NitroTaskRegistry } from './nitroTypes';

/**
 * Captures the errors of a Nitro app: the errors that reach Nitro's `error` hook, and the errors that its tasks throw.
 * Runs in the Nitro runtime plugin of `sentryNitro()`; `@sentry/nitro` wires the two up itself.
 *
 * Nitro's virtual modules only resolve when Nitro bundles the importing file, and `nitro dev` loads `node_modules`
 * unbundled, so the plugin passes in the task registry from `#nitro/virtual/tasks` instead.
 */
export function setupSentryNitroApp(nitroApp: NitroAppLike, tasks: NitroTaskRegistry): void {
  nitroApp.hooks.hook('error', captureNitroRequestError);
  instrumentNitroTasks(tasks);
}
