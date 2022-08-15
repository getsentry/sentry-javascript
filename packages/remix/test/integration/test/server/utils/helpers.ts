import express from 'express';
import { createRequestHandler } from '@remix-run/express';
import { getPortPromise } from 'portfinder';
import { wrapExpressCreateRequestHandler } from '@sentry/remix';

export * from '../../../../../../node-integration-tests/utils';

/**
 * Runs a test server
 * @returns URL
 */
export async function runServer(adapter: string = 'builtin'): Promise<string> {
  const requestHandlerFactory =
    adapter === 'express' ? wrapExpressCreateRequestHandler(createRequestHandler) : createRequestHandler;

  const app = express();
  const port = await getPortPromise();

  app.all('*', requestHandlerFactory({ build: require('../../../build') }));

  const server = app.listen(port, () => {
    setTimeout(() => {
      server.close();
    }, 4000);
  });

  return `http://localhost:${port}`;
}
