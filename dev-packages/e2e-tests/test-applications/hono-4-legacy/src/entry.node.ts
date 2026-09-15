import { Hono } from 'hono';
import { sentry } from '@sentry/hono/node';
import { serve } from '@hono/node-server';
import { addRoutes } from './routes';

const app = new Hono();

app.use(sentry(app));

addRoutes(app);

const port = Number(process.env.PORT || 38787);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Hono (Node) listening on port ${port}`);
});
