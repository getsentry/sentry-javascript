require('./tracing');

const Sentry = require('@sentry/node-experimental');
const { fastify } = require('fastify');
const fastifyPlugin = require('fastify-plugin');

const FastifySentry = fastifyPlugin(async (fastify, options) => {
  fastify.decorateRequest('_sentryContext', null);

  fastify.addHook('onError', async (_request, _reply, error) => {
    Sentry.captureException(error);
  });
});

const app = fastify();
const port = 3030;

app.register(FastifySentry);

app.get('/test-success', function (req, res) {
  res.send({ version: 'v1' });
});

app.get('/test-param/:param', function (req, res) {
  res.send({ paramWas: req.params.param });
});

app.get('/test-transaction', async function (req, res) {
  Sentry.startSpan({ name: 'test-span' }, () => {
    Sentry.startSpan({ name: 'child-span' }, () => {});
  });

  res.send({
    transactionIds: global.transactionIds || [],
  });
});

app.get('/test-error', async function (req, res) {
  const exceptionId = Sentry.captureException(new Error('This is an error'));

  await Sentry.flush(2000);

  res.send({ exceptionId });
});

app.listen({ port: port });

Sentry.addGlobalEventProcessor(event => {
  global.transactionIds = global.transactionIds || [];

  if (event.type === 'transaction') {
    const eventId = event.event_id;

    if (eventId) {
      global.transactionIds.push(eventId);
    }
  }

  return event;
});
