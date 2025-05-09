import type { IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { Scope } from '@sentry/core';
import { winterCGRequestToRequestData } from '@sentry/core';

/**
 * Set cloud resource context on scope.
 */
export function addCloudResourceContext(scope: Scope): void {
  scope.setContext('cloud_resource', {
    'cloud.provider': 'cloudflare',
  });
}

/**
 * Set culture context on scope
 */
export function addCultureContext(scope: Scope, cf: IncomingRequestCfProperties): void {
  scope.setContext('culture', {
    timezone: cf.timezone,
  });
}

/**
 * Set request data on scope
 */
export function addRequest(scope: Scope, request: Request): void {
  scope.setSDKProcessingMetadata({ normalizedRequest: winterCGRequestToRequestData(request) });
}
