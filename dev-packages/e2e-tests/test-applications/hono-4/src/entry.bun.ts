// Import the Sentry init first so `honoIntegration` subscribes to the Hono constructor channel
// before any `new Hono()` runs — including the sub-apps that route modules build at module scope.
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
