import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { tmpdir } from 'node:os';

const WORK_ITEMS = [
  { id: 'work_vienna', type: 'work', environment_id: 'env_1', data: { type: 'session', id: 'sesn_vienna' } },
  { id: 'work_graz', type: 'work', environment_id: 'env_1', data: { type: 'session', id: 'sesn_graz' } },
];

const STREAM_EVENTS = {
  sesn_vienna: [
    { type: 'agent.tool_use', id: 'sevt_vienna', name: 'weather', input: { city: 'Vienna' } },
    { type: 'session.status_terminated', id: 'sevt_vienna_end' },
  ],
  sesn_graz: [
    { type: 'agent.tool_use', id: 'sevt_graz', name: 'weather', input: { city: 'Graz' } },
    { type: 'session.status_terminated', id: 'sevt_graz_end' },
  ],
};

function startMockServer(onAllStopped) {
  const app = express();
  app.use(express.json());

  const queue = [...WORK_ITEMS];
  let stopped = 0;

  app.get('/anthropic/v1/environments/:environmentId/work/poll', (_req, res) => {
    res.json(queue.shift() ?? null);
  });
  app.post('/anthropic/v1/environments/:environmentId/work/:workId/ack', (req, res) => {
    res.json(WORK_ITEMS.find(work => work.id === req.params.workId));
  });
  app.post('/anthropic/v1/environments/:environmentId/work/:workId/heartbeat', (_req, res) => {
    res.json({ lease_extended: true, state: 'active', ttl_seconds: 30 });
  });
  app.post('/anthropic/v1/environments/:environmentId/work/:workId/stop', (req, res) => {
    res.json(WORK_ITEMS.find(work => work.id === req.params.workId));
    stopped++;
    if (stopped === WORK_ITEMS.length) {
      onAllStopped();
    }
  });

  app.get('/anthropic/v1/sessions/:sessionId', (req, res) => {
    res.json({ id: req.params.sessionId, type: 'session', resources: [] });
  });
  app.get('/anthropic/v1/sessions/:sessionId/events/stream', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

    const events = STREAM_EVENTS[req.params.sessionId];
    events.forEach((event, index) => {
      setTimeout(() => {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        if (index === events.length - 1) {
          res.end();
        }
      }, index * 10);
    });
  });
  app.get('/anthropic/v1/sessions/:sessionId/events', (_req, res) => {
    res.json({ data: [], next_page: null });
  });
  app.post('/anthropic/v1/sessions/:sessionId/events', (_req, res) => {
    res.json({ data: [] });
  });

  return new Promise(resolve => {
    const server = app.listen(0, () => {
      resolve(server);
    });
  });
}

async function run() {
  const controller = new AbortController();
  const server = await startMockServer(() => controller.abort());

  const client = new Anthropic({
    apiKey: 'mock-api-key',
    baseURL: `http://localhost:${server.address().port}/anthropic`,
  });
  const worker = client.beta.environments.work.worker({
    environmentId: 'env_1',
    environmentKey: 'mock-environment-key',
    workdir: tmpdir(),
    memorySyncIntervalMs: null,
    tools: () => [
      {
        name: 'weather',
        description: 'Get the weather by city',
        input_schema: { type: 'object', properties: { city: { type: 'string' } } },
        run: () => 'sunny',
      },
    ],
  });

  // Outside any span, as the SDK docs run the worker.
  await worker.run(controller.signal);

  await Sentry.flush(2000);

  server.close();
}

run();
