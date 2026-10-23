import type { CfProperties, IncomingRequestCfProperties } from '@cloudflare/workers-types';
import type { Scope } from '@sentry/core';

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
export function addCultureContext(scope: Scope, cf: IncomingRequestCfProperties | CfProperties): void {
  scope.setContext('culture', {
    timezone: cf.timezone,
  });
}
