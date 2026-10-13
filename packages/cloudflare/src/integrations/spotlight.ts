import type { Client, Envelope, IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, serializeEnvelope, suppressTracing } from '@sentry/core';
import { DEBUG_BUILD } from '../debug-build';

type SpotlightConnectionOptions = {
  /**
   * Set this if the Spotlight Sidecar is not running on localhost:8969.
   * By default, the URL is set to http://localhost:8969/stream
   */
  sidecarUrl?: string;
};

export const INTEGRATION_NAME = 'Spotlight' as const;

const _spotlightIntegration = ((options: Partial<SpotlightConnectionOptions> = {}) => {
  const sidecarUrl = options.sidecarUrl || 'http://localhost:8969/stream';

  return {
    name: INTEGRATION_NAME,
    setup(client) {
      DEBUG_BUILD && debug.log('[Spotlight] Using Sidecar URL', sidecarUrl);
      setupSidecarForwarding(client, sidecarUrl);
    },
  };
}) satisfies IntegrationFn;

/**
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 *
 * Important: This integration is intended for local development only.
 * Each forwarded envelope counts as a Worker subrequest (50 free / 1000 paid
 * per invocation), so it should not be enabled in production.
 */
export const spotlightIntegration = defineIntegration(_spotlightIntegration);

function setupSidecarForwarding(client: Client, sidecarUrl: string): void {
  const parsedUrl = parseSidecarUrl(sidecarUrl);
  if (!parsedUrl) {
    return;
  }

  let failCount = 0;

  client.on('beforeEnvelope', (envelope: Envelope) => {
    if (failCount > 3) {
      DEBUG_BUILD && debug.warn('[Spotlight] Disabled Sentry -> Spotlight forwarding due to too many failed requests');
      return;
    }

    const body = serializeEnvelope(envelope);

    suppressTracing(() => {
      fetch(parsedUrl.href, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
        },
      }).then(
        res => {
          // Consume the response body to satisfy Cloudflare Workers' requirement
          // that all fetch response bodies are read or cancelled.
          res.text().catch(() => {
            // no-op
          });

          if (res.status >= 200 && res.status < 400) {
            failCount = 0;
          }
        },
        () => {
          failCount++;
          DEBUG_BUILD && debug.warn('[Spotlight] Failed to send envelope to Spotlight Sidecar');
        },
      );
    });
  });
}

function parseSidecarUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    DEBUG_BUILD && debug.warn(`[Spotlight] Invalid sidecar URL: ${url}`);
    return undefined;
  }
}
