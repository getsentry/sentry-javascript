import type { DsnComponents } from '../types-hoist/dsn';
import type { LogContainerItem, LogEnvelope } from '../types-hoist/envelope';
import type { SerializedLog } from '../types-hoist/log';
import type { SdkMetadata } from '../types-hoist/sdkmetadata';
import { dsnToString } from '../utils/dsn';
import { createEnvelope } from '../utils/envelope';
import { isBrowser } from '../utils/isBrowser';

/**
 * Creates a log container envelope item for a list of logs.
 *
 * @param items - The logs to include in the envelope.
 * @param inferUserData - If true, tells Relay to infer the end-user IP and User-Agent from the incoming request.
 * @returns The created log container envelope item.
 */
export function createLogContainerEnvelopeItem(items: Array<SerializedLog>, inferUserData?: boolean): LogContainerItem {
  const inferSetting = inferUserData ? 'auto' : 'never';
  return [
    {
      type: 'log',
      item_count: items.length,
      content_type: 'application/vnd.sentry.items.log+json',
    },
    {
      version: 2,
      ...(isBrowser() && {
        ingest_settings: { infer_ip: inferSetting, infer_useragent: inferSetting },
      }),
      items,
    },
  ];
}

/**
 * Creates an envelope for a list of logs.
 *
 * Logs from multiple traces can be included in the same envelope.
 *
 * @param logs - The logs to include in the envelope.
 * @param metadata - The metadata to include in the envelope.
 * @param tunnel - The tunnel to include in the envelope.
 * @param dsn - The DSN to include in the envelope.
 * @param inferUserData - If true, tells Relay to infer the end-user IP and User-Agent from the incoming request.
 * @returns The created envelope.
 */
export function createLogEnvelope(
  logs: Array<SerializedLog>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
  inferUserData?: boolean,
): LogEnvelope {
  const headers: LogEnvelope[0] = {};

  if (metadata?.sdk) {
    headers.sdk = {
      name: metadata.sdk.name,
      version: metadata.sdk.version,
    };
  }

  if (!!tunnel && !!dsn) {
    headers.dsn = dsnToString(dsn);
  }

  return createEnvelope<LogEnvelope>(headers, [createLogContainerEnvelopeItem(logs, inferUserData)]);
}
