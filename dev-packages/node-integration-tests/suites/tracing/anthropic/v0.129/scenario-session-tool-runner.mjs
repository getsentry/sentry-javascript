import Anthropic from '@anthropic-ai/sdk';
import { SessionToolRunner } from '@anthropic-ai/sdk/resources/beta/sessions/events';
import * as Sentry from '@sentry/node';
import express from 'express';

const STREAM_EVENTS = {
  sesn_weather: [
    { type: 'agent.tool_use', id: 'sevt_weather', name: 'weather', input: { city: 'Vienna' } },
    { type: 'agent.tool_use', id: 'sevt_explode', name: 'explode', input: {} },
    { type: 'session.status_terminated', id: 'sevt_weather_end' },
  ],
  // Served by a runner built with `new SessionToolRunner()`, as `EnvironmentWorker` does.
  sesn_direct: [
    { type: 'agent.tool_use', id: 'sevt_read', name: 'read', input: { file_path: 'README.md' } },
    { type: 'session.status_terminated', id: 'sevt_direct_end' },
  ],
};

function startMockSessionsServer() {
  const app = express();
  app.use(express.json());

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

async function drain(runner) {
  for await (const _call of runner) {
    // drain
  }
}

async function run() {
  const server = await startMockSessionsServer();

  await Sentry.startSpan({ op: 'function', name: 'main' }, async () => {
    const client = new Anthropic({
      apiKey: 'mock-api-key',
      baseURL: `http://localhost:${server.address().port}/anthropic`,
    });

    await drain(
      client.beta.sessions.events.toolRunner('sesn_weather', {
        tools: [
          {
            name: 'weather',
            description: 'Get the weather by city',
            input_schema: { type: 'object', properties: { city: { type: 'string' } } },
            run: () => 'sunny',
          },
          {
            name: 'explode',
            description: 'Always fails',
            input_schema: { type: 'object', properties: {} },
            run: () => {
              throw new Error('Tool exploded');
            },
          },
        ],
      }),
    );

    await drain(
      new SessionToolRunner('sesn_direct', {
        client,
        tools: [
          {
            name: 'read',
            description: 'Read a file',
            input_schema: { type: 'object', properties: { file_path: { type: 'string' } } },
            run: () => '# Weather app',
          },
        ],
      }),
    );
  });

  await Sentry.flush(2000);

  server.close();
}

run();
