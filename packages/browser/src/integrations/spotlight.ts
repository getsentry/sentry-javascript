import type { Client, Envelope, IntegrationFn } from '@sentry/core';
import { debug, defineIntegration, serializeEnvelope } from '@sentry/core';
import { getNativeImplementation } from '@sentry-internal/browser-utils';
import { DEBUG_BUILD } from '../debug-build';
import type { WINDOW } from '../helpers';

export type SpotlightConnectionOptions = {
  /**
   * Set this if the Spotlight Sidecar is not running on localhost:8969
   * By default, the Url is set to http://localhost:8969/stream
   */
  sidecarUrl?: string;
};

export const INTEGRATION_NAME = 'SpotlightBrowser';

export const SPOTLIGHT_IGNORE_SPANS = [{ op: 'ui.interaction.click', name: '#sentry-spotlight' }];

const _spotlightIntegration = ((options: Partial<SpotlightConnectionOptions> = {}) => {
  const sidecarUrl = options.sidecarUrl || 'http://localhost:8969/stream';

  return {
    name: INTEGRATION_NAME,
    setup: () => {
      DEBUG_BUILD && debug.log('Using Sidecar URL', sidecarUrl);
    },
    beforeSetup(client: Client) {
      const opts = client.getOptions();
      opts.ignoreSpans = [...(opts.ignoreSpans || []), ...SPOTLIGHT_IGNORE_SPANS];
    },
    afterAllSetup: (client: Client) => {
      setupSidecarForwarding(client, sidecarUrl);
    },
  };
}) satisfies IntegrationFn;

function setupSidecarForwarding(client: Client, sidecarUrl: string): void {
  const makeFetch: typeof WINDOW.fetch | undefined = getNativeImplementation('fetch');
  let failCount = 0;

  client.on('beforeEnvelope', (envelope: Envelope) => {
    if (failCount > 3) {
      debug.warn('[Spotlight] Disabled Sentry -> Spotlight integration due to too many failed requests:', failCount);
      return;
    }

    makeFetch(sidecarUrl, {
      method: 'POST',
      body: serializeEnvelope(envelope),
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
      },
      mode: 'cors',
    }).then(
      res => {
        if (res.status >= 200 && res.status < 400) {
          // Reset failed requests counter on success
          failCount = 0;
        }
      },
      err => {
        failCount++;
        debug.error(
          "Sentry SDK can't connect to Sidecar is it running? See: https://spotlightjs.com/sidecar/npx/",
          err,
        );
      },
    );
  });
}

/**
 * Use this integration to send errors and transactions to Spotlight.
 *
 * Learn more about spotlight at https://spotlightjs.com
 */
export const spotlightBrowserIntegration = defineIntegration(_spotlightIntegration);
