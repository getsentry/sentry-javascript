import * as http from 'http';
import { Server, createServer } from 'http';
import { AddressInfo } from 'net';
import * as path from 'path';
import { parse } from 'url';
import next from 'next';
import { TestEnv } from '../../../../../../../dev-packages/node-integration-tests/utils';
import { register } from '../../../instrumentation';

let initializedSdk = false;

// Type not exported from NextJS
// @ts-expect-error
export const createNextServer = async config => {
  const app = next({ ...config, customServer: false }); // customServer: false because: https://github.com/vercel/next.js/pull/49805#issuecomment-1557321794
  const handle = app.getRequestHandler();
  await app.prepare();

  return createServer((req, res) => {
    const { url } = req;

    if (!url) {
      throw new Error('No url');
    }

    handle(req, res, parse(url, true));
  });
};

export const startServer = async (server: Server) => {
  return new Promise<{ server: http.Server; url: string }>(resolve => {
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      const url = `http://localhost:${port}`;
      resolve({ server, url });
    });
  });
};

export class NextTestEnv extends TestEnv {
  private constructor(public readonly server: http.Server, public readonly url: string) {
    super(server, url);
  }

  public static async init(): Promise<NextTestEnv> {
    if (!initializedSdk) {
      // Normally, Next.js calls the `register` hook by itself, but since we are using a custom server for the tests we need to do it manually.
      process.env.NEXT_RUNTIME = 'nodejs';
      await register();
      initializedSdk = true;
    }

    const server = await createNextServer({
      dev: false,
      dir: path.resolve(__dirname, '../../..'),

      // This needs to be explicitly passed to the server
      // Otherwise it causes Segmentation Fault with NextJS >= 12
      // https://github.com/vercel/next.js/issues/33008
      conf: path.resolve(__dirname, '../../next.config.js'),
    });

    const { url } = await startServer(server);

    return new NextTestEnv(server, url);
  }
}
