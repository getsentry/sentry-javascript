// Import the Sentry init first so `honoIntegration` is set up (and subscribed to Hono's per-request
// Context channel) before any request is handled.
import './instrument.bun';
import { Hono } from 'hono';
import { addRoutes } from './routes';

const app = new Hono();

addRoutes(app);

const port = Number(process.env.PORT || 38787);

export default {
  port,
  fetch: app.fetch,
};
