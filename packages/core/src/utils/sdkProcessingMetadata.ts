import type { Request, ScopeData } from '@sentry/types';
import { getIsolationScope } from '../currentScopes';

/**
 * Merge new SDK processing metadata into existing data.
 * New data will overwrite existing data.
 * `normalizedRequest` is special handled and will also be merged.
 */
export function mergeSdkProcessingMetadata(
  sdkProcessingMetadata: ScopeData['sdkProcessingMetadata'],
  newSdkProcessingMetadata: ScopeData['sdkProcessingMetadata'],
): ScopeData['sdkProcessingMetadata'] {
  // We want to merge `normalizedRequest` to avoid some partial entry on the scope
  // overwriting potentially more complete data on the isolation scope
  const normalizedRequestBefore = sdkProcessingMetadata['normalizedRequest'];
  const normalizedRequest = newSdkProcessingMetadata['normalizedRequest'];

  const newData = {
    ...sdkProcessingMetadata,
    ...newSdkProcessingMetadata,
  };

  if (normalizedRequestBefore || normalizedRequest) {
    newData['normalizedRequest'] = {
      ...(normalizedRequestBefore || {}),
      ...(normalizedRequest || {}),
    };
  }

  return newData;
}

/**
 * Set a normalizedRequest on the scope, ensuring it merges with potentially existing request data.
 * By default, this will put this data on the isolation scope,
 * but you can also pass a different scope to set the data on.
 */
export function setRequestEventData(normalizedRequest: Request, scope = getIsolationScope()): void {
  const normalizedRequestBefore = scope.getScopeData().sdkProcessingMetadata['normalizedRequest'];

  const newNormalizedRequest = {
    ...(normalizedRequestBefore || {}),
    ...normalizedRequest,
  } satisfies Request;

  scope.setSDKProcessingMetadata({ normalizedRequest: newNormalizedRequest });
}
