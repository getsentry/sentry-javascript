import type { InstrumentationConfig } from '@apm-js-collab/code-transformer';

/**
 * Name shared by the `Program` injection configs (their `transform` field) and
 * the custom transform registered on the bundler plugin (its `customTransforms`
 * key). Any unique string works — it only has to match on both sides.
 *
 * Lives in this dependency-free leaf so the per-library config files can build
 * their injection configs without importing the transform implementation (which
 * pulls in `meriyah` and must never reach the runtime `--import` path).
 */
export const SUBSCRIBE_TRANSFORM_NAME = 'sentrySubscribeOrchestrionChannel';

/**
 * Turn a library's channel-publishing configs into the `Program`-matching
 * injection configs that make each instrumented file self-register its channel
 * subscriber (via the {@link SUBSCRIBE_TRANSFORM_NAME} custom transform).
 *
 * Emits one injection per distinct instrumented file (deduped by module
 * matcher), so the subscribe snippet lands in exactly the files that receive
 * channels and inherits their precise version ranges. `channelName` carries the
 * package name (not a real channel — nothing is wrapped here) so the transform
 * can look up which subscriber to import.
 *
 * Co-located with each library's config (e.g. `mysqlSubscribeInjection`) but
 * kept OUT of `SENTRY_INSTRUMENTATIONS`: the runtime `--import` hook consumes
 * that list and can't register the custom transform, and an unregistered
 * `transform` makes the code-transformer drop the whole file. They are
 * aggregated separately into `SUBSCRIBE_INJECTIONS` and only handed to a bundler
 * plugin that opts in (and registers the transform).
 */
export function toSubscribeInjections(configs: InstrumentationConfig[]): InstrumentationConfig[] {
  const seen = new Set<string>();
  const injections: InstrumentationConfig[] = [];

  for (const { module } of configs) {
    const key = `${module.name}\0${module.versionRange}\0${String(module.filePath)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    injections.push({
      channelName: module.name,
      module,
      astQuery: 'Program',
      transform: SUBSCRIBE_TRANSFORM_NAME,
    });
  }

  return injections;
}
