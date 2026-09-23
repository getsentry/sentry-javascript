import { consoleSandbox } from '../utils/debug-logger';

/**
 * Warns when a build option that was removed in v11 is still present in a user's build config.
 *
 * TypeScript already rejects these keys, but meta-framework build configs are frequently plain
 * JavaScript (`next.config.js`, `next.config.mjs`), where a removed option would otherwise be a
 * silent no-op.
 *
 * @param options The user's build options, if any.
 * @param removedKeys The removed option names to check for.
 * @param logWarning Called at most once, with the full warning message. Defaults to `console.warn`,
 * which suits every SDK whose build step has no logger of its own. Pass this only to route the
 * warning through a framework logger (e.g. Astro's).
 *
 * @internal Only meant for Sentry-internal SDK usage.
 * @hidden
 */
// TODO(v12): Remove this helper along with the warnings it powers.
export function warnOnRemovedBuildOptions(
  options: object | undefined,
  removedKeys: string[],
  logWarning: (message: string) => void = message =>
    consoleSandbox(() => {
      // eslint-disable-next-line no-console
      console.warn(message);
    }),
): void {
  if (!options) {
    return;
  }

  // `in` rather than an `undefined` check: a user who comments out the nested fields leaves the key
  // behind with an `undefined` value, and the option is still gone.
  const presentKeys = removedKeys.filter(key => key in options);

  if (!presentKeys.length) {
    return;
  }

  logWarning(
    `[Sentry] Removed in v11 and ignored: ${presentKeys.join(', ')}. ` +
      'Set bundler plugin options directly on the Sentry build options.',
  );
}
