import { Hono } from 'hono';
import { addRoutes } from './routes';

const app = new Hono<{ Bindings: { E2E_TEST_DSN: string } }>();

addRoutes(app);

export default app;
