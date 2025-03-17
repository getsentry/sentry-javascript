import { createEnvelope } from '../utils-hoist';

import type { DsnComponents, SdkMetadata, SerializedOtelLog } from '../types-hoist';
import type { OtelLogEnvelope, OtelLogItem } from '../types-hoist/envelope';
import { dsnToString } from '../utils-hoist';

/**
 * Creates envelope item for a single log
 */
export function createOtelLogEnvelopeItem(log: SerializedOtelLog): OtelLogItem {
  const headers: OtelLogItem[0] = {
    type: 'otel_log',
  };

  return [headers, log];
}

/**
 * Records a log and sends it to sentry.
 *
 * Logs represent a message (and optionally some structured data) which provide context for a trace or error.
 * Ex: sentry.addLog({level: 'warning', message: `user ${user} just bought ${item}`, attributes: {user, item}}
 *
 * @params log - the log object which will be sent
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
