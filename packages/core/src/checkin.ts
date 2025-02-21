import type {
  CheckInEnvelope,
  CheckInItem,
  DsnComponents,
  DynamicSamplingContext,
  SdkMetadata,
  SerializedCheckIn,
} from './types-hoist';
import { dsnToString } from './utils-hoist/dsn';
import { createEnvelope } from './utils-hoist/envelope';
import { dropUndefinedKeys } from './utils-hoist/object';

/**
 * Create envelope from check in item.
 */
export function createCheckInEnvelope(
  checkIn: SerializedCheckIn,
  dynamicSamplingContext?: Partial<DynamicSamplingContext>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
): CheckInEnvelope {
  const headers: CheckInEnvelope[0] = {
    sent_at: new Date().toISOString(),
  };

  if (metadata?.sdk) {
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
  return createEnvelope<CheckInEnvelope>(headers, [item]);
}

function createCheckInEnvelopeItem(checkIn: SerializedCheckIn): CheckInItem {
  const checkInHeaders: CheckInItem[0] = {
    type: 'check_in',
  };
  return [checkInHeaders, checkIn];
}
