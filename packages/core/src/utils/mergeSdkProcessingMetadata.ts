import type { ScopeData } from '@sentry/types';

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
