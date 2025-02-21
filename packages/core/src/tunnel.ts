import { getEnvelopeEndpointWithUrlEncodedAuth } from './api';
import type { Client } from './client';
import { getClient } from './currentScopes';
import type { Transport } from './types-hoist/transport';
import { dsnFromString } from './utils-hoist/dsn';
import { createEnvelope, parseEnvelope } from './utils-hoist/envelope';

interface HandleTunnelOptions {
  /**
   * A list of DSNs that are allowed to be passed through the server.
   *
   * Defaults to only server DSN.
   */
  dsnAllowList?: string[];
  /**
   * The client instance to use
   *
   * Defaults to the global instance.
   */
  client?: Client;
}

let CACHED_TRANSPORTS: Map<string, Transport> | undefined;

/**
 * Handles envelopes sent from the browser client via the tunnel option.
 */
export async function handleTunnelEnvelope(
  envelopeBytes: Uint8Array,
  options: HandleTunnelOptions = {},
): Promise<void> {
  const client = options?.client || getClient();

  if (!client) {
    throw new Error('No server client');
  }

  const [headers, items] = parseEnvelope(envelopeBytes);

  if (!headers.dsn) {
    throw new Error('DSN missing from envelope headers');
  }

  // If the DSN in the envelope headers matches the server DSN, we can send it directly.
  const clientOptions = client.getOptions();
  if (headers.dsn === clientOptions.dsn) {
    await client.sendEnvelope(createEnvelope(headers, items));
    return;
  }

  if (!options.dsnAllowList?.includes(headers.dsn)) {
    throw new Error('DSN does not match server DSN or allow list');
  }

  if (!CACHED_TRANSPORTS) {
    CACHED_TRANSPORTS = new Map();
  }

  let transport = CACHED_TRANSPORTS.get(headers.dsn);

  if (!transport) {
    const dsn = dsnFromString(headers.dsn);
    if (!dsn) {
      throw new Error('Invalid DSN in envelope headers');
    }
    const url = getEnvelopeEndpointWithUrlEncodedAuth(dsn);

    const createTransport = clientOptions.transport;
    transport = createTransport({
      ...clientOptions.transportOptions,
      recordDroppedEvent: client.recordDroppedEvent.bind(client),
      url,
    });
    CACHED_TRANSPORTS.set(headers.dsn, transport);
  }

  await transport.send(createEnvelope(headers, items));
}
