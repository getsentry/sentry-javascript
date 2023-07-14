import type {
  CheckInEvelope,
  CheckInItem,
  DsnComponents,
  DynamicSamplingContext,
  SdkMetadata,
  SerializedCheckIn,
} from '@sentry/types';
import { createEnvelope, dropUndefinedKeys, dsnToString } from '@sentry/utils';

/**
 * Create envelope from check in item.
 */
export function createCheckInEnvelope(
  checkIn: SerializedCheckIn,
  dynamicSamplingContext?: Partial<DynamicSamplingContext>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
): CheckInEvelope {
  const headers: CheckInEvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  if (metadata && metadata.sdk) {
    headers.sdk = {
      name: metadata.sdk.name,
      version: metadata.sdk.version,
    };
  }

  if (!!tunnel && !!dsn) {
    headers.dsn = dsnToString(dsn);
  }

  if (dynamicSamplingContext) {
    headers.trace = dropUndefinedKeys(dynamicSamplingContext) as DynamicSamplingContext;
  }

  const item = createCheckInEnvelopeItem(checkIn);
  return createEnvelope<CheckInEvelope>(headers, [item]);
}

function createCheckInEnvelopeItem(checkIn: SerializedCheckIn): CheckInItem {
  const checkInHeaders: CheckInItem[0] = {
    type: 'check_in',
  };
  return [checkInHeaders, checkIn];
}
