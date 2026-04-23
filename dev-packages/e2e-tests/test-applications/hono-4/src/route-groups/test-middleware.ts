import { Hono } from 'hono';

const testMiddleware = new Hono();

testMiddleware.get('/named', c => c.json({ middleware: 'named' }));
testMiddleware.get('/anonymous', c => c.json({ middleware: 'anonymous' }));
testMiddleware.get('/multi', c => c.json({ middleware: 'multi' }));
testMiddleware.get('/error', c => c.text('should not reach'));

export { testMiddleware };
