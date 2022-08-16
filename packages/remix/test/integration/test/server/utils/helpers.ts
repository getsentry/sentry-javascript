import express from 'express';
import { createRequestHandler } from '@remix-run/express';
import { getPortPromise } from 'portfinder';
import { wrapExpressCreateRequestHandler } from '@sentry/remix';
import type { TestServerConfig } from '../../../../../../node-integration-tests/utils';
import nock from 'nock';
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

  const { server, scope } = await new Promise<{ server: http.Server; scope: nock.Scope }>(resolve => {
    const app = express();

    app.all('*', requestHandlerFactory({ build: require('../../../build') }));

    const server = app.listen(port, () => {
      const scope = nock('https://dsn.ingest.sentry.io').persist();

      resolve({ server, scope });
    });
  });

  return {
    url: `http://localhost:${port}`,
    server,
    scope,
  };
}
