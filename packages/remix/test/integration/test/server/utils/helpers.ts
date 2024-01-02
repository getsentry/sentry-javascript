import * as http from 'http';
import { AddressInfo } from 'net';
import { createRequestHandler } from '@remix-run/express';
import { wrapExpressCreateRequestHandler } from '@sentry/remix';
import express from 'express';
import { TestEnv } from '../../../../../../../dev-packages/node-integration-tests/utils';

export * from '../../../../../../../dev-packages/node-integration-tests/utils';

export class RemixTestEnv extends TestEnv {
  private constructor(public readonly server: http.Server, public readonly url: string) {
    super(server, url);
  }

  public static async init(adapter: string = 'builtin'): Promise<RemixTestEnv> {
    const requestHandlerFactory =
      adapter === 'express' ? wrapExpressCreateRequestHandler(createRequestHandler) : createRequestHandler;

    let serverPort;
    const server = await new Promise<http.Server>(resolve => {
      const app = express();

      app.all('*', requestHandlerFactory({ build: require('../../../build') }));

      const server = app.listen(0, () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve(server);
      });
    });

    return new RemixTestEnv(server, `http://localhost:${serverPort}`);
  }
}
