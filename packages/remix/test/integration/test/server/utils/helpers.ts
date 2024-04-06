import * as http from 'http';
import { AddressInfo } from 'net';
import { createRequestHandler as createFastifyRequestHandler } from '@mcansh/remix-fastify';
import { createRequestHandler as createExpressRequestHandler } from '@remix-run/express';
import { wrapExpressCreateRequestHandler, wrapFastifyCreateRequestHandler } from '@sentry/remix';
import express from 'express';
import fastify from 'fastify';

import { TestEnv } from '../../../../../../../dev-packages/node-integration-tests/utils';

export * from '../../../../../../../dev-packages/node-integration-tests/utils';

export const enum Adapter {
  Builtin = 'builtin',
  Express = 'express',
  Fastify = 'fastify',
}

const adapters = {
  [Adapter.Builtin]: createExpressRequestHandler,
  [Adapter.Express]: wrapExpressCreateRequestHandler(createExpressRequestHandler),
  [Adapter.Fastify]: wrapFastifyCreateRequestHandler(createFastifyRequestHandler),
};

const runExpressApp = (adapter: Adapter.Builtin | Adapter.Express): Promise<http.Server> => new Promise(
  res => {
  const app = express();
  app.all('*', adapters[adapter]({ build: require('../../../build') }));
  res(app.listen(0));
  }
)

const runFastifyApp = (): Promise<http.Server> => new Promise(res => {
  const app = fastify();
  // @ts-ignore
  app.all('*', adapters[Adapter.Fastify]({ build: require('../../../build') }));
  app.listen({port: 0}, (_err, _addr) => {
    res(app.server)
  });
})

export class RemixTestEnv extends TestEnv {
  private constructor(public readonly server: http.Server, public readonly url: string) {
    super(server, url);
  }

  public static async init(adapter: Adapter): Promise<RemixTestEnv> {
    const srv = adapter === Adapter.Fastify ? await runFastifyApp() : await runExpressApp(adapter);
    const port = (srv.address() as AddressInfo).port
    return new RemixTestEnv(srv, `http://localhost:${port}`);
  }
}
