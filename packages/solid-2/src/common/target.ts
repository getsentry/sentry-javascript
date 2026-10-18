import type { ChangeOrigin } from 'solid-js/attribution';
import { formatOrigin } from 'solid-js/attribution';

/**
 * The element an interaction hit, as Solid recorded it. What text it carries
 * is the engine's decision, made where the record is built
 * (`AttributionOptions.values`): the SDK asks for `"none"` unless
 * `targetText` is on, so nothing here has to strip anything.
 */
export function describeTarget(target: string | undefined): string | undefined {
  return target;
}

/** `formatOrigin`, named here so every span that names an origin uses one sentence shape. */
export function describeOrigin(origin: ChangeOrigin): string {
  return formatOrigin(origin);
}
