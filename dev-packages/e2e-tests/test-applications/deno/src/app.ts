import { trace } from '@opentelemetry/api';

// Simulate a pre-existing OTel provider (like Supabase Edge Runtime registers
// before user code runs). Without trace.disable() in Sentry's setup, this would
// cause setGlobalTracerProvider to be a no-op, silently dropping all OTel spans.
const fakeProvider = {
  getTracer: () => ({
    startSpan: () => ({ end: () => {}, setAttributes: () => {} }),
    startActiveSpan: (_name: string, fn: Function) => fn({ end: () => {}, setAttributes: () => {} }),
  }),
};
trace.setGlobalTracerProvider(fakeProvider as any);

// Sentry.init() must call trace.disable() to clear the fake provider above
import * as Sentry from '@sentry/deno';
import { generateText } from 'ai';
import { MockLanguageModelV1 } from 'ai/test';
import IORedis from 'ioredis';
import mysql from 'mysql';
import pg from 'pg';
import { createClient } from 'redis';
import { z } from 'zod';

Sentry.init({
  environment: 'qa',
  dsn: Deno.env.get('E2E_TEST_DSN'),
  debug: !!Deno.env.get('DEBUG'),
  tunnel: 'http://localhost:3031/',
  tracesSampleRate: 1,
  // Left unset (so the default span streaming applies) unless the
  // `deno (static trace lifecycle)` variant asks for the other lifecycle.
  traceLifecycle: Deno.env.get('E2E_TEST_STATIC') ? 'static' : undefined,
});

// `mysql` and `pg` don't emit tracing signals on their own. The
// `--preload=@sentry/deno/import` in this app's start script registers the
// orchestrion runtime hook before the entry graph loads, so both are
// transformed to publish the `orchestrion:mysql:query` / `orchestrion:pg:query`
// diagnostics channels that `init()` above has just subscribed to. `deno.json`
// maps that specifier to the installed file rather than to
// `npm:@sentry/deno`, because this app installs the SDK from a local tarball.
// A tarball has no registry version for Deno to match a preloaded `npm:`
// specifier against.
const connection = mysql.createConnection({
  host: Deno.env.get('MYSQL_HOST') ?? '127.0.0.1',
  port: Number(Deno.env.get('MYSQL_PORT') ?? 3306),
  user: 'root',
  password: 'password',
});

// Swallow connection errors (e.g. a DB container going away at teardown) so
// they don't become an uncaught exception that crashes the process on shutdown.
connection.on('error', (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('mysql connection error', err);
});

connection.connect((err: unknown) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error('mysql connect error', err);
  }
});

const pgClient = new pg.Client({
  host: Deno.env.get('PGHOST') ?? '127.0.0.1',
  port: Number(Deno.env.get('PGPORT') ?? 5432),
  user: 'postgres',
  password: 'password',
  database: 'postgres',
});

pgClient.on('error', (err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('pg client error', err);
});

pgClient.connect((err: unknown) => {
  if (err) {
    // eslint-disable-next-line no-console
    console.error('pg connect error', err);
  }
});

const redisUrl = Deno.env.get('REDIS_URL') ?? 'redis://127.0.0.1:6379';

// One shared client per process. node-redis publishes to the
// `node-redis:command` / `:batch` / `:connect` diagnostics channels for every
// operation on this client; redisIntegration is already subscribed to
// those.
const redis = createClient({ url: redisUrl });
function onRedisError(err: unknown) {
  // eslint-disable-next-line no-console
  console.error('redis client error', err);
}
redis.on('error', onRedisError);
await redis.connect();

// Separate ioredis client. ioredis >= 5.11 publishes to the `ioredis:command`
// and `ioredis:connect` channels, which redisIntegration also subscribes
// to. lazyConnect so we can yield a microtick before connecting and ensure
// the DC subscriber is registered before ioredis creates its tracing channels.
await Promise.resolve();
const ioredisUrl = new URL(redisUrl);
const ioredis = new IORedis({
  host: ioredisUrl.hostname,
  port: Number(ioredisUrl.port) || 6379,
  lazyConnect: true,
});
function onIoredisError(err: unknown) {
  // eslint-disable-next-line no-console
  console.error('ioredis client error', err);
}
ioredis.on('error', onIoredisError);
await ioredis.connect();

const port = 3030;

Deno.serve({ port, hostname: '0.0.0.0' }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === '/test-success') {
    return new Response(JSON.stringify({ version: 'v1' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (url.pathname === '/test-error') {
    const exceptionId = Sentry.captureException(new Error('This is an error'));
    return new Response(JSON.stringify({ exceptionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test Sentry.startSpan — uses Sentry's internal pipeline
  if (url.pathname === '/test-sentry-span') {
    Sentry.startSpan({ name: 'test-sentry-span' }, () => {
      // noop
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test OTel tracer.startSpan — goes through the global TracerProvider
  if (url.pathname === '/test-otel-span') {
    const tracer = trace.getTracer('test-tracer');
    const span = tracer.startSpan('test-otel-span');
    span.end();
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test OTel tracer.startActiveSpan — what AI SDK and most instrumentations use
  if (url.pathname === '/test-otel-active-span') {
    const tracer = trace.getTracer('test-tracer');
    tracer.startActiveSpan('test-otel-active-span', span => {
      span.setAttributes({ 'test.active': true });
      span.end();
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test interop: OTel span inside a Sentry span
  if (url.pathname === '/test-interop') {
    Sentry.startSpan({ name: 'sentry-parent' }, () => {
      const tracer = trace.getTracer('test-tracer');
      const span = tracer.startSpan('otel-child');
      span.end();
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test breadcrumbs: add a breadcrumb then capture an error
  if (url.pathname === '/test-breadcrumb') {
    Sentry.addBreadcrumb({
      message: 'test-breadcrumb',
      category: 'custom',
      level: 'info',
    });
    const exceptionId = Sentry.captureException(new Error('breadcrumb-test'));
    return new Response(JSON.stringify({ exceptionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test context: set user, tag, extra then capture an error
  if (url.pathname === '/test-context') {
    Sentry.setUser({ id: '123', email: 'test@sentry.io' });
    Sentry.setTag('deno-runtime', 'true');
    Sentry.setExtra('detail', { key: 'value' });
    const exceptionId = Sentry.captureException(new Error('context-test'));
    return new Response(JSON.stringify({ exceptionId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test scope isolation: tags inside withScope do not leak
  if (url.pathname === '/test-scope-isolation') {
    let insideId: string | undefined;
    let outsideId: string | undefined;

    Sentry.withScope(scope => {
      scope.setTag('isolated', 'yes');
      insideId = Sentry.captureException(new Error('inside-scope'));
    });

    outsideId = Sentry.captureException(new Error('outside-scope'));

    return new Response(JSON.stringify({ insideId, outsideId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test outbound fetch instrumentation
  if (url.pathname === '/test-outgoing-fetch') {
    const response = await Sentry.startSpan({ name: 'test-outgoing-fetch' }, async () => {
      const res = await fetch('http://localhost:3030/test-success');
      return res.json();
    });
    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test AI: Vercel AI SDK generateText with mock model
  if (url.pathname === '/test-ai') {
    const results = await Sentry.startSpan({ op: 'function', name: 'ai-test' }, async () => {
      // First call - telemetry enabled by default
      const result1 = await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'First span here!',
          }),
        }),
        prompt: 'Where is the first span?',
      });

      // Second call - explicitly enabled telemetry
      const result2 = await generateText({
        experimental_telemetry: { isEnabled: true },
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'Second span here!',
          }),
        }),
        prompt: 'Where is the second span?',
      });

      // Third call - with tool calls
      const result3 = await generateText({
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'tool-calls',
            usage: { promptTokens: 15, completionTokens: 25 },
            text: 'Tool call completed!',
            toolCalls: [
              {
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                args: '{ "location": "San Francisco" }',
              },
            ],
          }),
        }),
        tools: {
          getWeather: {
            parameters: z.object({ location: z.string() }),
            execute: async (args: { location: string }) => {
              return `Weather in ${args.location}: Sunny, 72°F`;
            },
          },
        },
        prompt: 'What is the weather in San Francisco?',
      });

      // Fourth call - explicitly disabled telemetry, should not be captured
      const result4 = await generateText({
        experimental_telemetry: { isEnabled: false },
        model: new MockLanguageModelV1({
          doGenerate: async () => ({
            rawCall: { rawPrompt: null, rawSettings: {} },
            finishReason: 'stop',
            usage: { promptTokens: 10, completionTokens: 20 },
            text: 'Should not be captured!',
          }),
        }),
        prompt: 'Where is the disabled span?',
      });

      return {
        result1: result1.text,
        result2: result2.text,
        result3: result3.text,
        result4: result4.text,
      };
    });

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test AI error: tool call that throws
  if (url.pathname === '/test-ai-error') {
    try {
      await Sentry.startSpan({ op: 'function', name: 'ai-error-test' }, async () => {
        await generateText({
          experimental_telemetry: { isEnabled: true },
          model: new MockLanguageModelV1({
            doGenerate: async () => ({
              rawCall: { rawPrompt: null, rawSettings: {} },
              finishReason: 'tool-calls',
              usage: { promptTokens: 15, completionTokens: 25 },
              text: 'Tool call completed!',
              toolCalls: [
                {
                  toolCallType: 'function',
                  toolCallId: 'call-1',
                  toolName: 'getWeather',
                  args: '{ "location": "San Francisco" }',
                },
              ],
            }),
          }),
          tools: {
            getWeather: {
              parameters: z.object({ location: z.string() }),
              execute: async (_args: { location: string }) => {
                throw new Error('Tool call failed');
              },
            },
          },
          prompt: 'What is the weather in San Francisco?',
        });
      });
    } catch (e) {
      Sentry.captureException(e);
    }

    return new Response(JSON.stringify({ status: 'error-handled' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test metrics: emit counter, distribution, and gauge
  if (url.pathname === '/test-metrics') {
    Sentry.metrics.count('test.deno.count', 1, {
      attributes: {
        endpoint: '/test-metrics',
        'random.attribute': 'Apples',
      },
    });
    Sentry.metrics.distribution('test.deno.distribution', 100, {
      attributes: {
        endpoint: '/test-metrics',
        'random.attribute': 'Bananas',
      },
    });
    Sentry.metrics.gauge('test.deno.gauge', 200, {
      attributes: {
        endpoint: '/test-metrics',
        'random.attribute': 'Cherries',
      },
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Test logs: emit a debug log via Sentry.logger
  if (url.pathname === '/test-log') {
    Sentry.logger.debug('Accessed /test-log route');
    return new Response(JSON.stringify({ message: 'Log sent' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Runs two queries, the second NESTED inside the first's callback. mysql
  // dispatches that callback from its socket data handler (a fresh async
  // context), so the nested query's span only lands on this request's
  // http.server transaction if `denoMysqlIntegration`'s AsyncLocalStorage
  // context strategy restored the parent across the async boundary.
  if (url.pathname === '/test-mysql') {
    await new Promise<void>((resolve, reject) => {
      connection.query('SELECT 1 + 1 AS solution', (err: unknown) => {
        if (err) return reject(err);
        connection.query('SELECT NOW()', (err2: unknown) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    return Response.json({ status: 'ok' });
  }

  // Same nested-callback shape as `/test-mysql`, for
  // `denoPostgresIntegration`'s context strategy.
  if (url.pathname === '/test-pg') {
    await new Promise<void>((resolve, reject) => {
      pgClient.query('SELECT 1 + 1 AS solution', (err: unknown) => {
        if (err) return reject(err);
        pgClient.query('SELECT NOW()', (err2: unknown) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
    return Response.json({ status: 'ok' });
  }

  // node-redis: GET — exercises the command channel, success path.
  if (url.pathname === '/redis-get') {
    const key = url.searchParams.get('key') ?? 'cache:key';
    const value = await redis.get(key);
    return Response.json({ key, value });
  }

  // node-redis: SET then GET — exercises two commands inside a single
  // transaction so we can assert the parent has two db.query children.
  if (url.pathname === '/redis-set-get') {
    const key = url.searchParams.get('key') ?? 'cache:key';
    const value = url.searchParams.get('value') ?? 'hello';
    await redis.set(key, value);
    const echoed = await redis.get(key);
    return Response.json({ key, value: echoed });
  }

  // node-redis: MULTI — exercises the batch channel.
  if (url.pathname === '/redis-multi') {
    const result = await redis.multi().set('multi:a', '1').set('multi:b', '2').get('multi:a').exec();
    return Response.json({ result });
  }

  // ioredis: GET — exercises the ioredis:command channel.
  if (url.pathname === '/ioredis-get') {
    const key = url.searchParams.get('key') ?? 'iocache:key';
    const value = await ioredis.get(key);
    return Response.json({ key, value });
  }

  // ioredis: SET then GET — two commands inside a transaction.
  if (url.pathname === '/ioredis-set-get') {
    const key = url.searchParams.get('key') ?? 'iocache:key';
    const value = url.searchParams.get('value') ?? 'hello';
    await ioredis.set(key, value);
    const echoed = await ioredis.get(key);
    return Response.json({ key, value: echoed });
  }

  // ioredis: MULTI — ioredis has no separate batch channel; per-command
  // payloads carry `batchMode`/`batchSize` instead, so we still expect one
  // db.query span per command.
  if (url.pathname === '/ioredis-multi') {
    const result = await ioredis.multi().set('iomulti:a', '1').set('iomulti:b', '2').get('iomulti:a').exec();
    return Response.json({ result });
  }

  // ioredis: PIPELINE — same shape as MULTI from the perspective of the
  // diagnostics channel.
  if (url.pathname === '/ioredis-pipeline') {
    const result = await ioredis.pipeline().set('iopipe:a', '1').set('iopipe:b', '2').get('iopipe:a').exec();
    return Response.json({ result });
  }

  if (url.pathname === '/redis-disconnect') {
    redis.off('error', onRedisError);
    redis.close();
    ioredis.off('error', onIoredisError);
    ioredis.disconnect();
    return new Response('ok');
  }

  return new Response('Not found', { status: 404 });
});

console.log(`Deno test app listening on port ${port}`);
