import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { addRoutes } from './routes';

const app = new Hono();

addRoutes(app);

const port = Number(process.env.PORT || 38787);

serve({ fetch: app.fetch, port }, () => {
  // eslint-disable-next-line no-console
  console.log(`Hono (Node) listening on port ${port}`);
});
