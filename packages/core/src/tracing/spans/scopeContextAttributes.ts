import {
  ANGULAR_VERSION,
  CULTURE_LOCALE,
  CULTURE_TIMEZONE,
  HTTP_RESPONSE_BODY_SIZE,
  HTTP_RESPONSE_STATUS_CODE,
  REACT_VERSION,
  SENTRY_PROFILER_ID,
  SENTRY_PROFILE_ID,
  STATE_TYPE,
} from '@sentry/conventions/attributes';
import type { Contexts } from '../../types/context';

/**
 * Convert known scope contexts set by SDK integrations to span attributes.
 * Only maps context keys that are relevant to browser SDKs.
 * Server-only contexts (aws, gcp, trpc) are handled
 * by processSegmentSpan hooks in their respective packages.
 */
export function scopeContextsToSpanAttributes(contexts: Contexts): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};

  const { response, profile, cloud_resource, culture, state } = contexts;

  if (response) {
    if (response.status_code != null) {
      attrs[HTTP_RESPONSE_STATUS_CODE] = response.status_code;
    }
    if (response.body_size != null) {
      attrs[HTTP_RESPONSE_BODY_SIZE] = response.body_size;
    }
  }

  if (profile) {
    if (profile.profile_id) {
      attrs[SENTRY_PROFILE_ID] = profile.profile_id;
    }
    if (profile.profiler_id) {
      attrs[SENTRY_PROFILER_ID] = profile.profiler_id;
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
      attrs[CULTURE_LOCALE] = culture.locale;
    }
    if (culture.timezone) {
      attrs[CULTURE_TIMEZONE] = culture.timezone;
    }
  }

  if (state?.state && typeof state.state.type === 'string') {
    attrs[STATE_TYPE] = state.state.type;
  }

  // Framework version contexts
  const angular = contexts['angular'];
  if (angular) {
    const version = angular['version'];
    if (typeof version === 'string' || typeof version === 'number') {
      attrs[ANGULAR_VERSION] = version;
    }
  }

  const react = contexts['react'];
  if (react) {
    const version = react['version'];
    if (typeof version === 'string' || typeof version === 'number') {
      attrs[REACT_VERSION] = version;
    }
  }

  return attrs;
}
