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
export function createBasicSentryServer(onEnvelope: (env: Envelope) => void): Promise<number> {
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
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
  });
}

type HeaderAssertCallback = (headers: Record<string, string | string[] | undefined>) => void;

/** Creates a test server that can be used to check headers */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createTestServer(done: (error: unknown) => void) {
  const gets: Array<[string, HeaderAssertCallback, number]> = [];

  return {
    get: function (path: string, callback: HeaderAssertCallback, result = 200) {
      gets.push([path, callback, result]);
      return this;
    },
    start: async (): Promise<string> => {
      const app = express();

      for (const [path, callback, result] of gets) {
        app.get(path, (req, res) => {
          try {
            callback(req.headers);
          } catch (e) {
            done(e);
          }

          res.status(result).send();
        });
      }

      return new Promise(resolve => {
        const server = app.listen(0, () => {
          const address = server.address() as AddressInfo;
          resolve(`http://localhost:${address.port}`);
        });
      });
    },
  };
}
