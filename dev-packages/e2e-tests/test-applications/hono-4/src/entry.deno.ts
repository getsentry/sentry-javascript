// Import the Sentry init first so `honoIntegration` is set up (and subscribed to Hono's per-request
// Context channel) before any request is handled.
import './instrument.deno';
import { Hono } from 'hono';
import { addRoutes } from './routes';

const app = new Hono();

addRoutes(app);

const port = Number(Deno.env.get('PORT') || 38787);

Deno.serve({ port }, app.fetch);
