import * as http from 'http';
import { AddressInfo } from 'net';
import { createRequestHandler } from '@remix-run/express';
import express from 'express';
import { TestEnv } from '../../../../../../../dev-packages/node-integration-tests/utils';

export * from '../../../../../../../dev-packages/node-integration-tests/utils';

export class RemixTestEnv extends TestEnv {
  private constructor(public readonly server: http.Server, public readonly url: string) {
    super(server, url);
  }

  public static async init(): Promise<RemixTestEnv> {
    let serverPort;
    const server = await new Promise<http.Server>(resolve => {
      const app = express();

      app.all('*', createRequestHandler({ build: require('../../../build') }));

      const server = app.listen(0, () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve(server);
      });
    });

    return new RemixTestEnv(server, `http://localhost:${serverPort}`);
  }
}
