// this adds the tracing methods to the hub
import '@sentry/tracing';

import { Hub, makeMain } from '@sentry/hub';
import { NodeClient } from '@sentry/node';
import { logger } from '@sentry/utils';
import * as http from 'http';
import { AddressInfo } from 'net';
import createNextServer from 'next';
import * as path from 'path';

// not known until the tests run, as it's set to pick a random open port
let port: number;

// kept globally so it can be closed after all tests have run
let nodeServer: http.Server;

describe('test running example app', () => {
  beforeAll(async () => {
    // this instruments the server for errors and tracing
    nodeServer = await startServer();
    // done();
  });

  // beforeEach(() => {});
  describe('request transactions', () => {
    it('creates a transaction for API requests', async () => {
      const hub = new Hub(new NodeClient({ tracesSampleRate: 1, debug: true }));
      makeMain(hub);
      const startTransaction = jest.spyOn(hub, 'startTransaction');

      http.request(`http://localhost:${port}/api/users`);

      expect(startTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'GET /api/users', op: 'http.server' }),
      );
      // done();
    });
  });

  afterAll(() => {
    logger.log('Stopping server.');
    nodeServer.close((err?: Error) => {
      if (err) {
        logger.error(err);
        process.exit(1);
      }
      process.exit(0);
    });
  });
});

// let requestHandler: ReqHandler;

async function startServer(): Promise<http.Server> {
  const nextServer = createNextServer({
    dir: path.resolve('./test/integration/test-app'),
  });
  // debugger;
  const nodeServer = http.createServer(nextServer.getRequestHandler());
  nodeServer.on('listening', () => {
    port = (nodeServer.address() as AddressInfo).port;
    logger.log(`Server started. Listening on port ${port}.`);
  });
  nodeServer.listen(0, '0.0.0.0');
  // the `prepare` method loads config from `next.config.js`, which imports from `@sentry/nextjs`, a side effect of
  // which is to instrument the server for errors and tracing (this instrumentation also starts the SDK, using the code
  // in `sentry.server.config.js`)
  await nextServer.prepare();

  return nodeServer;
}
