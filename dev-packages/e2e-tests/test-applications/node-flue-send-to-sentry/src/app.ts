import '../sentry-init.ts';
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { Hello } from './agents/hello.ts';

const app = new Hono();

app.route('/agents/hello', createAgentRouter(Hello));

export default app;
