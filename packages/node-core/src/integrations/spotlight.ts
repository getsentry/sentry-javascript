import * as http from 'node:http';
import type { Client, Envelope, IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, serializeEnvelope, suppressTracing } from '@sentry/core';

type SpotlightConnectionOptions = {
  /**
   * Set this if the Spotlight Sidecar is not running on localhost:8969
   * By default, the Url is set to http://localhost:8969/stream
   */
  sidecarUrl?: string;
};

export const INTEGRATION_NAME = 'Spotlight';

const _spotlightIntegration = ((options: Partial<SpotlightConnectionOptions> = {}) => {
  const _options = {
    sidecarUrl: options.sidecarUrl || 'http://localhost:8969/stream',
  };

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      try {
        if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
          debug.warn("[Spotlight] It seems you're not in dev mode. Do you really want to have Spotlight enabled?");
        }
      } catch {
        // ignore
      }
      connectToSpotlight(client, _options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 *
 * Important: This integration only works with Node 18 or newer.
 */
export const spotlightIntegration = defineIntegration(_spotlightIntegration);

function connectToSpotlight(client: Client, options: Required<SpotlightConnectionOptions>): void {
  const spotlightUrl = parseSidecarUrl(options.sidecarUrl);
  if (!spotlightUrl) {
    return;
  }

  let failedRequests = 0;

  client.on('beforeEnvelope', (envelope: Envelope) => {
    if (failedRequests > 3) {
      debug.warn('[Spotlight] Disabled Sentry -> Spotlight integration due to too many failed requests');
      return;
    }

    const serializedEnvelope = serializeEnvelope(envelope);
    suppressTracing(() => {
      const req = http.request(
        {
          method: 'POST',
          path: spotlightUrl.pathname,
          hostname: spotlightUrl.hostname,
          port: spotlightUrl.port,
          headers: {
            'Content-Type': 'application/x-sentry-envelope',
          },
        },
        res => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            // Reset failed requests counter on success
            failedRequests = 0;
          }
          res.on('data', () => {
            // Drain socket
          });

          res.on('end', () => {
            // Drain socket
          });
          res.setEncoding('utf8');
        },
      );

      req.on('error', () => {
        failedRequests++;
        debug.warn('[Spotlight] Failed to send envelope to Spotlight Sidecar');
      });
      req.write(serializedEnvelope);
      req.end();
    });
  });
}

function parseSidecarUrl(url: string): URL | undefined {
  try {
    return new URL(`${url}`);
  } catch {
    debug.warn(`[Spotlight] Invalid sidecar URL: ${url}`);
    return undefined;
  }
}
