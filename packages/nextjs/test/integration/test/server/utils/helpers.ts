import { getPortPromise } from 'portfinder';
import { TestEnv } from '../../../../../../node-integration-tests/utils';
import * as http from 'http';
import * as path from 'path';
import { createNextServer, startServer } from '../../utils/common';

export class NextTestEnv extends TestEnv {
  private constructor(public readonly server: http.Server, public readonly url: string) {
    super(server, url);
  }

  public static async init(): Promise<NextTestEnv> {
    const port = await getPortPromise();
    const server = await createNextServer({
      dev: false,
      dir: path.resolve(__dirname, '../../..'),
    });

    await startServer(server, port);

    return new NextTestEnv(server, `http://localhost:${port}`);
  }
}
