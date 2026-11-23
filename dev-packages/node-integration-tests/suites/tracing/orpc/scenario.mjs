import { createServer } from 'node:http';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createRouterClient, ORPCError, os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { sendPortToRunner } from '@sentry-internal/node-integration-tests';

const find = os.handler(({ input }) => ({ name: input.name }));

const serverClient = createRouterClient({ planet: { find } });

const router = {
  planet: {
    find,
    nested: os.handler(() => serverClient.planet.find({ name: 'Mars' })),
    crash: os.handler(() => {
      throw new Error('Sentry Test Error');
    }),
    missing: os.handler(() => {
      throw new ORPCError('NOT_FOUND');
    }),
    stream: os.handler(async function* () {
      yield { count: 1 };
      throw new Error('Sentry Stream Error');
    }),
  },
};

const handler = new RPCHandler(router);

let client;

const server = createServer(async (req, res) => {
  if (req.url === '/client-call') {
    const planet = await client.planet.find({ name: 'Earth' });
    res.end(JSON.stringify(planet));
    return;
  }

  const { matched } = await handler.handle(req, res, { prefix: '/rpc' });
  if (!matched) {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(0, () => {
  const port = server.address().port;
  client = createORPCClient(new RPCLink({ url: `http://localhost:${port}/rpc` }));
  sendPortToRunner(port);
});
