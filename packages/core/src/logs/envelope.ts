import { createEnvelope } from '../utils-hoist';

import type { DsnComponents, SdkMetadata, SerializedOtelLog } from '../types-hoist';
import type { OtelLogEnvelope, OtelLogItem } from '../types-hoist/envelope';
import { dsnToString } from '../utils-hoist';

/**
 * Creates OTEL log envelope item for a serialized OTEL log.
 *
 * @param log - The serialized OTEL log to include in the envelope.
 * @returns The created OTEL log envelope item.
 */
export function createOtelLogEnvelopeItem(log: SerializedOtelLog): OtelLogItem {
  return [
    {
      type: 'otel_log',
    },
    log,
  ];
}

/**
 * Creates an envelope for a list of logs.
 *
 * @param logs - The logs to include in the envelope.
 * @param metadata - The metadata to include in the envelope.
 * @param tunnel - The tunnel to include in the envelope.
 * @param dsn - The DSN to include in the envelope.
 * @returns The created envelope.
 */
export function createOtelLogEnvelope(
  logs: Array<SerializedOtelLog>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
): OtelLogEnvelope {
  const headers: OtelLogEnvelope[0] = {};

  if (metadata?.sdk) {
    headers.sdk = {
      name: metadata.sdk.name,
      version: metadata.sdk.version,
    };
  }

  if (!!tunnel && !!dsn) {
    headers.dsn = dsnToString(dsn);
  }

  return createEnvelope<OtelLogEnvelope>(headers, logs.map(createOtelLogEnvelopeItem));
}
