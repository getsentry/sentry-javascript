import express from 'express';
import { createRequestHandler } from '@remix-run/express';
import { getPortPromise } from 'portfinder';
import { wrapExpressCreateRequestHandler } from '@sentry/remix';
import type { TestServerConfig } from '../../../../../../node-integration-tests/utils';
import * as http from 'http';

export * from '../../../../../../node-integration-tests/utils';

/**
 * Runs a test server
 * @returns URL
 */
export async function runServer(adapter: string = 'builtin'): Promise<TestServerConfig> {
  const requestHandlerFactory =
    adapter === 'express' ? wrapExpressCreateRequestHandler(createRequestHandler) : createRequestHandler;

  const port = await getPortPromise();

  const server = await new Promise<http.Server>(resolve => {
    const app = express();

    app.all('*', requestHandlerFactory({ build: require('../../../build') }));

    const server = app.listen(port, () => {
      resolve(server);
    });
  });

  return {
    url: `http://localhost:${port}`,
    server,
  };
}
