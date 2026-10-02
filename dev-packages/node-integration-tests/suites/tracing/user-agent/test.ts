import { URL_FULL, USER_AGENT_ORIGINAL, SENTRY_OP } from '@sentry/conventions/attributes';
import { createTestServer } from '@sentry-internal/test-utils';
import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../utils/runner';

describe('user_agent.original', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });

  createEsmAndCjsTests(__dirname, 'server.mjs', 'instrument.mjs', (createRunner, test) => {
    test('sets the incoming user agent on every span without overwriting outgoing request user agents', async () => {
      const [SERVER_URL, closeTestServer] = await createTestServer()
        .get('/fetch', () => {})
        .get('/http', () => {})
        .start();

      const runner = createRunner()
        .withEnv({ SERVER_URL })
        .unordered()
        .expect({
          span: container => {
            const segmentSpan = container.items.find(s => !!s.is_segment);
            const childSpan = container.items.find(s => s.name === 'child-span');
            const fetchSpan = container.items.find(
              s =>
                s.attributes[SENTRY_OP]?.value === 'http.client' &&
                s.attributes[URL_FULL]?.value === `${SERVER_URL}/fetch`,
            );
            const httpSpan = container.items.find(
              s =>
                s.attributes[SENTRY_OP]?.value === 'http.client' &&
                s.attributes[URL_FULL]?.value === `${SERVER_URL}/http`,
            );

            expect(segmentSpan!.attributes['http.request.header.user-agent']).toEqual({
              type: 'array',
              value: ['Mozilla/5.0 (test)'],
            });

            const incomingUserAgent = { type: 'string', value: 'Mozilla/5.0 (test)' };
            expect(segmentSpan!.attributes[USER_AGENT_ORIGINAL]).toEqual(incomingUserAgent);
            expect(childSpan!.attributes[USER_AGENT_ORIGINAL]).toEqual(incomingUserAgent);

            expect(fetchSpan!.attributes[USER_AGENT_ORIGINAL]).toEqual({
              type: 'string',
              value: 'outgoing-fetch-agent',
            });
            expect(httpSpan!.attributes[USER_AGENT_ORIGINAL]).toEqual({ type: 'string', value: 'outgoing-http-agent' });
          },
        })
        .start();

      await runner.makeRequest('get', '/test', { headers: { 'User-Agent': 'Mozilla/5.0 (test)' } });

      await runner.completed();
      closeTestServer();
    });
  });
});
