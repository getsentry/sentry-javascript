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
 * Returns a Resource for use in Sentry's OpenTelemetry TracerProvider setup.
 *
 * Combines the default OTel SDK telemetry attributes with Sentry-specific
 * service attributes, equivalent to what was previously done via:
 * `defaultResource().merge(resourceFromAttributes({ ... }))`
 */
export function getSentryResource(serviceName: string): SentryResource {
  return new SentryResource({
    [ATTR_SERVICE_NAME]: serviceName,
    // eslint-disable-next-line deprecation/deprecation
    [SEMRESATTRS_SERVICE_NAMESPACE]: 'sentry',
    [ATTR_SERVICE_VERSION]: SDK_VERSION,
    [ATTR_TELEMETRY_SDK_LANGUAGE]: SDK_INFO[ATTR_TELEMETRY_SDK_LANGUAGE],
    [ATTR_TELEMETRY_SDK_NAME]: SDK_INFO[ATTR_TELEMETRY_SDK_NAME],
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_INFO[ATTR_TELEMETRY_SDK_VERSION],
  });
}
