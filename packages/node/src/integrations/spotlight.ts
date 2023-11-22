import type { Client, Integration } from '@sentry/types';
import { logger, serializeEnvelope } from '@sentry/utils';
import * as http from 'http';
import { URL } from 'url';

type SpotlightConnectionOptions = {
  /**
   * Set this if the Spotlight Sidecar is not running on localhost:8969
   * By default, the Url is set to http://localhost:8969
   */
  sidecarUrl?: string;
};

/**
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 *
 * Important: This integration only works with Node 18 or newer
 *
 * @param options
 * @returns
 */
export class Spotlight implements Integration {
  public static id = 'Spotlight';
  public name = Spotlight.id;

  private readonly _options: Required<SpotlightConnectionOptions>;

  public constructor(options?: SpotlightConnectionOptions) {
    this._options = {
      sidecarUrl: options?.sidecarUrl || 'http://localhost:8969',
    };
  }

  /**
   * JSDoc
   */
  public setupOnce(): void {
    // empty but otherwise TS complains
  }

  /**
   * Sets up forwarding envelopes to the Spotlight Sidecar
   */
  public setup(client: Client): void {
    if (process.env.NODE_ENV !== 'development') {
      logger.warn("[Spotlight] It seems you're not in dev mode. Do you really want to have Spoltight enabled?");
    }
    connectToSpotlight(client, this._options);
  }
}

function connectToSpotlight(client: Client, options: Required<SpotlightConnectionOptions>): void {
  const spotlightUrl = parseSidecarUrl(options.sidecarUrl);
  if (!spotlightUrl) {
    return;
  }

  let failedRequests = 0;

  if (typeof client.on !== 'function') {
    logger.warn('[Spotlight] Cannot connect to spotlight due to missing method on SDK client (`client.on`)');
    return;
  }

  client.on('beforeEnvelope', envelope => {
    if (failedRequests > 3) {
      logger.warn('[Spotlight] Disabled Sentry -> Spotlight integration due to too many failed requests');
      return;
    }

    const serializedEnvelope = serializeEnvelope(envelope);

    const req = http.request(
      {
        method: 'POST',
        path: '/stream',
        hostname: spotlightUrl.hostname,
        port: spotlightUrl.port,
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
      },
      res => {
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
      logger.warn('[Spotlight] Failed to send envelope to Spotlight Sidecar');
    });
    req.write(serializedEnvelope);
    req.end();
  });
}

function parseSidecarUrl(url: string): URL | undefined {
  try {
    return new URL(`${url}/stream`);
  } catch {
    logger.warn(`[Spotlight] Invalid sidecar URL: ${url}`);
    return undefined;
  }
}
