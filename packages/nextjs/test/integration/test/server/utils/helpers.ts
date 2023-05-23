import { getPortPromise } from 'portfinder';
import { TestEnv } from '../../../../../../node-integration-tests/utils';
import * as http from 'http';
import * as path from 'path';
import { createServer, Server } from 'http';
import { parse } from 'url';
import next from 'next';

// Type not exported from NextJS
// @ts-ignore
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

export const startServer = async (server: Server, port: string | number) => {
  return new Promise(resolve => {
    server.listen(port || 0, () => {
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
    const port = await getPortPromise();
    const server = await createNextServer({
      dev: false,
      dir: path.resolve(__dirname, '../../..'),

      // This needs to be explicitly passed to the server
      // Otherwise it causes Segmentation Fault with NextJS >= 12
      // https://github.com/vercel/next.js/issues/33008
      conf: path.resolve(__dirname, '../../next.config.js'),
    });

    await startServer(server, port);

    return new NextTestEnv(server, `http://localhost:${port}`);
  }
}
