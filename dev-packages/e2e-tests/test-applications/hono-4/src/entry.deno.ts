// Import the Sentry init first so `honoIntegration` subscribes to the Hono constructor channel
// before any `new Hono()` runs — including the sub-apps that route modules build at module scope.
import './instrument.deno';
import { Hono } from 'hono';
import { addRoutes } from './routes';

const app = new Hono();

addRoutes(app);

const port = Number(Deno.env.get('PORT') || 38787);

Deno.serve({ port }, app.fetch);
