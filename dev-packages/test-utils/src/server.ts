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
export function createBasicSentryServer(onEnvelope: (env: Envelope) => void): Promise<[number, () => void]> {
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
      resolve([
        address.port,
        () => {
          server.close();
        },
      ]);
    });
  });
}

type HeaderAssertCallback = (headers: Record<string, string | string[] | undefined>) => void;

/** Creates a test server that can be used to check headers */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createTestServer() {
  const gets: Array<[string, HeaderAssertCallback, number]> = [];
  let error: unknown | undefined;

  return {
    get: function (path: string, callback: HeaderAssertCallback, result = 200) {
      gets.push([path, callback, result]);
      return this;
    },
    start: async (): Promise<[string, () => void]> => {
      const app = express();

      for (const [path, callback, result] of gets) {
        app.get(path, (req, res) => {
          try {
            callback(req.headers);
          } catch (e) {
            error = e;
          }

          res.status(result).send();
        });
      }

      return new Promise(resolve => {
        const server = app.listen(0, () => {
          const address = server.address() as AddressInfo;
          resolve([
            `http://localhost:${address.port}`,
            () => {
              server.close();
              if (error) {
                throw error;
              }
            },
          ]);
        });
      });
    },
  };
}
