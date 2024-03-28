import type { AddressInfo } from 'net';
import type { Envelope } from '@sentry/types';
import { parseEnvelope } from '@sentry/utils';
import express from 'express';

/**
 * Creates a basic Sentry server that accepts POST to the envelope endpoint
 *
 * This does no checks on the envelope, it just calls the callback if it managed to parse an envelope from the raw POST
 * body data.
 */
export function createBasicSentryServer(
  onEnvelope: (env: Envelope, headers: Record<string, string>) => void,
): Promise<number> {
  const app = express();
  app.use(express.raw({ type: () => true, inflate: true, limit: '100mb' }));
  app.post('/api/:id/envelope/', (req, res) => {
    try {
      const env = parseEnvelope(req.body as Buffer);
      onEnvelope(env, req.headers);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }

    res.status(200).send();
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
}
