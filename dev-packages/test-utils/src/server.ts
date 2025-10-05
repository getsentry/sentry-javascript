import type { Envelope } from '@sentry/core';
import { parseEnvelope } from '@sentry/core';
import express from 'express';
import type { AddressInfo } from 'net';

/**
 * Creates a basic Sentry server that accepts POST to the envelope endpoint
 *
 * This does no checks on the envelope, it just calls the callback if it managed to parse an envelope from the raw POST
 * body data.
 */
export function createBasicSentryServer(
  onEnvelope: (env: Envelope) => void,
  { signal }: { readonly signal?: AbortSignal },
): Promise<[number, () => void]> {
  const app = express();

  app.use(express.raw({ type: () => true, inflate: true, limit: '100mb' }));
  app.post('/api/:id/envelope/', (req, res) => {
    try {
      const env = parseEnvelope(req.body as Buffer);
      onEnvelope(env);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }

    res.status(200).send();
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      signal?.addEventListener('abort', () => server.close());
      const address = server.address() as AddressInfo;
      resolve([
        address.port,
        () => {
          server.close();
        },
      ]);
    });
  });
}
