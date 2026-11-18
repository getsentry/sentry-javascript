import Anthropic from '@anthropic-ai/sdk';
import * as Sentry from '@sentry/node';
import express from 'express';
import { tmpdir } from 'node:os';
import { startMockServer, streamSseEvents } from '@sentry-internal/node-integration-tests';

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

function startMockApi(onAllStopped) {
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
    const events = STREAM_EVENTS[req.params.sessionId];
    streamSseEvents(res, events, { eventNames: true });
  });
  app.get('/anthropic/v1/sessions/:sessionId/events', (_req, res) => {
    res.json({ data: [], next_page: null });
  });
  app.post('/anthropic/v1/sessions/:sessionId/events', (_req, res) => {
    res.json({ data: [] });
  });

  return startMockServer(app);
}

async function run() {
  const controller = new AbortController();
  const server = await startMockApi(() => controller.abort());

  const client = new Anthropic({
    apiKey: 'mock-api-key',
    baseURL: `${server.url}/anthropic`,
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
