import express from 'express';
import type { AddressInfo } from 'net';

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
