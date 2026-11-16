import Fastify from 'fastify';
import http2 from 'node:http2';

async function run() {
  const app = Fastify({ http2: true });

  app.get('/users/:id', async () => {
    return { ok: true };
  });

  await app.listen({ port: 0 });

  const client = http2.connect(`http://localhost:${app.server.address().port}`);
  await new Promise((resolve, reject) => {
    const stream = client.request({ ':path': '/users/42' });
    stream.on('error', reject);
    stream.on('data', () => {});
    stream.on('end', resolve);
    stream.end();
  });

  client.close();
  await app.close();
}

run();
