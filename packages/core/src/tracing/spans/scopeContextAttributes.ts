import type { Contexts } from '../../types-hoist/context';

/**
 * Convert known scope contexts set by SDK integrations to span attributes.
 * Only maps context keys that are relevant to browser SDKs.
 * Server-only contexts (aws, gcp, missing_instrumentation, trpc) are handled
 * by processSegmentSpan hooks in their respective packages.
 */
export function scopeContextsToSpanAttributes(contexts: Contexts): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  const { response, profile, cloud_resource, culture, state } = contexts;

  if (response) {
    if (response.status_code != null) {
      attrs['http.response.status_code'] = response.status_code;
    }
    if (response.body_size != null) {
      attrs['http.response.body.size'] = response.body_size;
    }
  }

  if (profile) {
    if (profile.profile_id) {
      attrs['sentry.profile_id'] = profile.profile_id;
    }
    if (profile.profiler_id) {
      attrs['sentry.profiler_id'] = profile.profiler_id;
    }
  }

  // CloudResourceContext keys are already in dot-notation (OTel resource conventions)
  if (cloud_resource) {
    for (const [key, value] of Object.entries(cloud_resource)) {
      if (value != null) {
        attrs[key] = value;
      }
    }
  }

  if (culture) {
    if (culture.locale) {
      attrs['culture.locale'] = culture.locale;
    }
    if (culture.timezone) {
      attrs['culture.timezone'] = culture.timezone;
    }
  }

  if (state?.state && typeof state.state.type === 'string') {
    attrs['state.type'] = state.state.type;
  }

  // Framework version contexts
  const angular = contexts['angular'];
  if (angular) {
    const version = angular['version'];
    if (typeof version === 'string' || typeof version === 'number') {
      attrs['angular.version'] = version;
    }
  }

  const react = contexts['react'];
  if (react) {
    const version = react['version'];
    if (typeof version === 'string' || typeof version === 'number') {
      attrs['react.version'] = version;
    }
  }

  return attrs;
}
