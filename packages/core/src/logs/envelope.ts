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
 * When `spanStreamingEnabled` is false, the payload is emitted in the legacy (v1) shape for
 * backwards compatibility: Relay's historical behavior for log envelopes was to always infer
 * end-user IP and User-Agent. Sending `version: 2` opts the payload into the explicit
 * `ingest_settings` protocol, which would silently turn that inference off for SDKs that
 * haven't adopted the new behavior.
 *
 * @param items - The logs to include in the envelope.
 * @param spanStreamingEnabled - If true, emit the v2 payload shape with explicit `ingest_settings`.
 * @param inferUserData - If true, tells Relay to infer the end-user IP and User-Agent from the incoming request.
 * @returns The created log container envelope item.
 */
export function createLogContainerEnvelopeItem(
  items: Array<SerializedLog>,
  spanStreamingEnabled?: boolean,
  inferUserData?: boolean,
): LogContainerItem {
  const inferSetting = inferUserData ? 'auto' : 'never';
  return [
    {
      type: 'log',
      item_count: items.length,
      content_type: 'application/vnd.sentry.items.log+json',
    },
    {
      ...(spanStreamingEnabled && {
        version: 2,
        ...(isBrowser() && {
          ingest_settings: { infer_ip: inferSetting, infer_user_agent: inferSetting },
        }),
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
 * @param spanStreamingEnabled - If true, emit the v2 payload shape with explicit `ingest_settings`.
 * @param inferUserData - If true, tells Relay to infer the end-user IP and User-Agent from the incoming request.
 * @returns The created envelope.
 */
export function createLogEnvelope(
  logs: Array<SerializedLog>,
  metadata?: SdkMetadata,
  tunnel?: string,
  dsn?: DsnComponents,
  spanStreamingEnabled?: boolean,
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

  return createEnvelope<LogEnvelope>(headers, [
    createLogContainerEnvelopeItem(logs, spanStreamingEnabled, inferUserData),
  ]);
}
