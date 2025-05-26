import type { Resource } from '@opentelemetry/resources';
import OpenTelemetryResources from '@opentelemetry/resources';

type OpenTelemetryResourcesV1 = {
  Resource: Resource;
};

type OpenTelemetryResourcesV2 = {
  defaultResource: () => Resource;
  resourceFromAttributes: (attributes: Record<string, string>) => Resource;
};

function isOtelResourcesV1(resources: unknown): resources is OpenTelemetryResourcesV1 {
  return (
    typeof resources === 'object' &&
    resources !== null &&
    'Resource' in resources &&
    typeof resources.Resource === 'function'
  );
}

function isOtelResourcesV2(resources: unknown): resources is OpenTelemetryResourcesV2 {
  return (
    typeof resources === 'object' &&
    resources !== null &&
    'defaultResource' in resources &&
    typeof resources.defaultResource === 'function' &&
    'resourceFromAttributes' in resources &&
    typeof resources.resourceFromAttributes === 'function'
  );
}

/**
 * Get an OpenTelemetry Resource from attributes.
 * This is a helper to create a version agnostic OpenTelemetry Resource.
 */
export function getResourceFromAttributes(attributes: Record<string, string>): Resource {
  if (isOtelResourcesV1(OpenTelemetryResources)) {
    return new OpenTelemetryResources.Resource(attributes);
  } else if (isOtelResourcesV2(OpenTelemetryResources)) {
    return OpenTelemetryResources.defaultResource().merge(OpenTelemetryResources.resourceFromAttributes(attributes));
  } else {
    // fallback to v1
    return new OpenTelemetryResources.Resource(attributes);
  }
}
