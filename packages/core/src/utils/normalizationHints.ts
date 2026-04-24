import { addNonEnumerableProperty } from './object';

/**
 * Internal symbols for normalization behavior. JSON and other structured user payloads cannot
 * carry these keys, so they cannot spoof SDK-only normalization hints.
 */
const SENTRY_SKIP_NORMALIZATION = Symbol('sentry.skipNormalization');
const SENTRY_OVERRIDE_NORMALIZATION_DEPTH = Symbol('sentry.overrideNormalizationDepth');

/** Marks an object so `normalize` returns it unchanged (already-normalized SDK data). */
export function setSkipNormalizationHint(obj: object): void {
  addNonEnumerableProperty(obj, SENTRY_SKIP_NORMALIZATION, true);
}

/** Overrides remaining normalization depth from this object downward (e.g. Redux / Pinia state). */
export function setNormalizationDepthOverrideHint(obj: object, depth: number): void {
  addNonEnumerableProperty(obj, SENTRY_OVERRIDE_NORMALIZATION_DEPTH, depth);
}

/** @internal */
export function hasSkipNormalizationHint(value: object) {
  return Boolean((value as Record<symbol, unknown>)[SENTRY_SKIP_NORMALIZATION]);
}

/** @internal */
export function getNormalizationDepthOverrideHint(value: object): number | undefined {
  const v = (value as Record<symbol, unknown>)[SENTRY_OVERRIDE_NORMALIZATION_DEPTH];
  return typeof v === 'number' ? v : undefined;
}
