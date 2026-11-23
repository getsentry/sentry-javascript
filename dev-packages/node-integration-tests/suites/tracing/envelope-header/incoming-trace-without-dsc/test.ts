import { parseBaggageHeader } from '@sentry/core';
import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect, onTestFinished } from 'vitest';
import { supports } from '../../../../utils';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';

const TRACE_ID = '12345678901234567890123456789012';
const PARENT_SPAN_ID = '1234567890123456';

const CLIENT_DSC = {
  trace_id: TRACE_ID,
  public_key: 'public',
  environment: 'prod',
  release: '1.0',
  org_id: '123',
};

type Lifecycle = 'stream' | 'static';

/**
 * Starts the server that the app sends its outgoing request to, and records the headers of that request.
 */
async function startOutgoingRequestTarget(): Promise<{
  url: string;
  getHeaders: () => Record<string, string | string[] | undefined>;
}> {
  let headers: Record<string, string | string[] | undefined> = {};
  const [url, close] = await createTestServer()
    .get('/outgoing', requestHeaders => {
      headers = requestHeaders;
    })
    .start();
  onTestFinished(close);
  return { url, getHeaders: () => headers };
}

function toSentryBaggage(dsc: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(dsc).map(([key, value]) => [`sentry-${key}`, value]));
}

// Bun before 1.4 does not instrument outgoing `node:http` requests.
// See https://github.com/getsentry/sentry-javascript/issues/23881
describe.runIf(supports({ bunMin: '1.4.0' }))('DSC of an incoming trace without baggage', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  describe.each<Lifecycle>(['stream', 'static'])('traceLifecycle: %s', lifecycle => {
    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
      test('creates the DSC from the segment span for an inherited positive decision', async () => {
        const expectedDsc = {
          ...CLIENT_DSC,
          sampled: 'true',
          sample_rate: '1',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        };
        const outgoing = await startOutgoingRequestTarget();

        const runner = createRunner()
          .withEnv({ SERVER_URL: outgoing.url, TRACE_LIFECYCLE: lifecycle, TRACES_SAMPLE_RATE: '0.5' })
          .expectHeader(
            lifecycle === 'stream' ? { span: { trace: expectedDsc } } : { transaction: { trace: expectedDsc } },
          )
          .start();
        await runner.makeRequest('get', '/test', { headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1` } });
        await runner.completed();

        const { 'sentry-trace': sentryTrace, baggage } = outgoing.getHeaders();
        expect(sentryTrace).toMatch(new RegExp(`^${TRACE_ID}-[a-f0-9]{16}-1$`));
        expect(parseBaggageHeader(baggage)).toStrictEqual(toSentryBaggage(expectedDsc));
      });

      test('creates the DSC from the segment span for an inherited negative decision', async () => {
        const expectedDsc = {
          ...CLIENT_DSC,
          sampled: 'false',
          sample_rate: '0',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        };
        const outgoing = await startOutgoingRequestTarget();

        const runner = createRunner()
          .withEnv({ SERVER_URL: outgoing.url, TRACE_LIFECYCLE: lifecycle, TRACES_SAMPLE_RATE: '1' })
          .expectHeader({ event: { trace: expectedDsc } })
          .start();
        await runner.makeRequest('get', '/error', { headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-0` } });
        await runner.completed();

        const { 'sentry-trace': sentryTrace, baggage } = outgoing.getHeaders();
        expect(sentryTrace).toMatch(new RegExp(`^${TRACE_ID}-[a-f0-9]{16}-0$`));
        expect(parseBaggageHeader(baggage)).toStrictEqual(toSentryBaggage(expectedDsc));
      });

      test('creates the DSC from the segment span with the local sample rate for a deferred decision', async () => {
        const expectedDsc = {
          ...CLIENT_DSC,
          sampled: expect.stringMatching(/^(true|false)$/),
          sample_rate: '0.5',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        };
        const outgoing = await startOutgoingRequestTarget();

        const runner = createRunner()
          .withEnv({ SERVER_URL: outgoing.url, TRACE_LIFECYCLE: lifecycle, TRACES_SAMPLE_RATE: '0.5' })
          .ignore('span', 'transaction')
          .expectHeader({ event: { trace: expectedDsc } })
          .start();
        await runner.makeRequest('get', '/error', { headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}` } });
        await runner.completed();

        const { 'sentry-trace': sentryTrace, baggage } = outgoing.getHeaders();
        const outgoingDsc = parseBaggageHeader(baggage);
        const sampled = outgoingDsc?.['sentry-sampled'] === 'true';
        expect(outgoingDsc).toStrictEqual(toSentryBaggage(expectedDsc));
        expect(sentryTrace).toMatch(new RegExp(`^${TRACE_ID}-[a-f0-9]{16}-${sampled ? 1 : 0}$`));
        expect(Number(outgoingDsc?.['sentry-sample_rand']) < 0.5).toBe(sampled);
      });

      test('adds the segment name to the DSC if its source is not `url`', async () => {
        const expectedDsc = {
          ...CLIENT_DSC,
          sampled: 'true',
          sample_rate: '1',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
          transaction: 'named-segment',
        };
        const outgoing = await startOutgoingRequestTarget();

        const runner = createRunner()
          .withEnv({ SERVER_URL: outgoing.url, TRACE_LIFECYCLE: lifecycle, TRACES_SAMPLE_RATE: '0.5' })
          .expectHeader(
            lifecycle === 'stream' ? { span: { trace: expectedDsc } } : { transaction: { trace: expectedDsc } },
          )
          .start();
        await runner.makeRequest('get', '/named', { headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}-1` } });
        await runner.completed();

        expect(parseBaggageHeader(outgoing.getHeaders().baggage)).toStrictEqual(toSentryBaggage(expectedDsc));
      });
    });

    createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument-traces-sampler.mjs', (createRunner, test) => {
      test('creates the DSC from the segment span with the tracesSampler sample rate', async () => {
        const expectedDsc = {
          ...CLIENT_DSC,
          sampled: expect.stringMatching(/^(true|false)$/),
          sample_rate: '0.5',
          sample_rand: expect.stringMatching(/^0\.\d+$/),
        };
        const outgoing = await startOutgoingRequestTarget();

        const runner = createRunner()
          .withEnv({ SERVER_URL: outgoing.url, TRACE_LIFECYCLE: lifecycle })
          .ignore('span', 'transaction')
          .expectHeader({ event: { trace: expectedDsc } })
          .start();
        await runner.makeRequest('get', '/error', { headers: { 'sentry-trace': `${TRACE_ID}-${PARENT_SPAN_ID}` } });
        await runner.completed();

        const { 'sentry-trace': sentryTrace, baggage } = outgoing.getHeaders();
        const outgoingDsc = parseBaggageHeader(baggage);
        const sampled = outgoingDsc?.['sentry-sampled'] === 'true';
        expect(outgoingDsc).toStrictEqual(toSentryBaggage(expectedDsc));
        expect(sentryTrace).toMatch(new RegExp(`^${TRACE_ID}-[a-f0-9]{16}-${sampled ? 1 : 0}$`));
        expect(Number(outgoingDsc?.['sentry-sample_rand']) < 0.5).toBe(sampled);
      });
    });
  });
});
