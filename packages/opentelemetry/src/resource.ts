import type { Attributes, AttributeValue } from '@opentelemetry/api';
import { SDK_INFO } from '@opentelemetry/core';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_TELEMETRY_SDK_LANGUAGE,
  ATTR_TELEMETRY_SDK_NAME,
  ATTR_TELEMETRY_SDK_VERSION,
  SEMRESATTRS_SERVICE_NAMESPACE,
} from '@opentelemetry/semantic-conventions';
import { SDK_VERSION } from '@sentry/core';

type RawResourceAttribute = [string, AttributeValue | undefined];

/**
 * Minimal Resource implementation that satisfies the OpenTelemetry Resource interface
 * used by BasicTracerProvider, without depending on `@opentelemetry/resources`.
 */
class SentryResource {
  private _attributes: Attributes;

  public constructor(attributes: Attributes) {
    this._attributes = attributes;
  }

  public get attributes(): Attributes {
    return this._attributes;
  }

  public merge(other: SentryResource | null): SentryResource {
    if (!other) {
      return this;
    }
    return new SentryResource({ ...this._attributes, ...other.attributes });
  }

  public getRawAttributes(): RawResourceAttribute[] {
    return Object.entries(this._attributes);
  }
}

/**
 * Parses `OTEL_RESOURCE_ATTRIBUTES` env var (comma-separated `key=value` pairs).
 * Values are URL-decoded per the OTel spec.
 */
function parseOtelResourceAttributes(raw: string | undefined): Attributes {
  if (!raw) {
    return {};
  }
  const result: Attributes = {};
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = pair.substring(0, eq).trim();
    const value = pair.substring(eq + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Returns a Resource for use in Sentry's OpenTelemetry TracerProvider setup.
 *
 * Combines the default OTel SDK telemetry attributes with Sentry-specific
 * service attributes, equivalent to what was previously done via:
 * `defaultResource().merge(resourceFromAttributes({ ... }))`
 *
 * Respects OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES environment variables
 * per the OpenTelemetry specification.
 */
export function getSentryResource(serviceNameFallback: string): SentryResource {
  const env = typeof process !== 'undefined' ? process.env : {};
  const otelServiceName = env.OTEL_SERVICE_NAME;
  const otelResourceAttrs = parseOtelResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES);

  return new SentryResource({
    // Lowest priority: Sentry defaults
    // eslint-disable-next-line deprecation/deprecation
    [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
    [ATTR_SERVICE_NAME]: serviceNameFallback,
    // OTEL_RESOURCE_ATTRIBUTES overrides defaults (including service.name and service.namespace)
    ...otelResourceAttrs,
    // OTEL_SERVICE_NAME explicitly overrides service.name
    ...(otelServiceName ? { [ATTR_SERVICE_NAME]: otelServiceName } : {}),
    // Highest priority: Sentry SDK telemetry attrs (cannot be overridden by env vars)
    [ATTR_SERVICE_VERSION]: SDK_VERSION,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: SDK_INFO[ATTR_TELEMETRY_SDK_LANGUAGE],
    [ATTR_TELEMETRY_SDK_NAME]: SDK_INFO[ATTR_TELEMETRY_SDK_NAME],
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_INFO[ATTR_TELEMETRY_SDK_VERSION],
  });
}
