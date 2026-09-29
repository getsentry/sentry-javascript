import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { Hello } from './agents/hello.ts';
import { requireTestToken } from './auth.ts';

const app = new Hono();

// global-setup.ts waits for this route to answer before the tests start.
app.get('/', c => c.text('Hello World!'));
app.use('/agents/*', requireTestToken);
app.route('/agents/hello', createAgentRouter(Hello));

export default app;
