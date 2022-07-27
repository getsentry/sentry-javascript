import express from 'express';
import { createRequestHandler } from '@remix-run/express';
import { getPortPromise } from 'portfinder';

export * from '../../../../../../node-integration-tests/utils';

/**
 * Runs a test server
 * @returns URL
 */
export async function runServer(): Promise<string> {
  const app = express();
  const port = await getPortPromise();

  app.all('*', createRequestHandler({ build: require('../../../build') }));

  const server = app.listen(port, () => {
    setTimeout(() => {
      server.close();
    }, 4000);
  });

  return `http://localhost:${port}`;
}
