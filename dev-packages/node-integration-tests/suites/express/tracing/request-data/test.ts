import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { join } from 'node:path';
import { findSegmentSpan } from '../helpers';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(join(__dirname, '..'), 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    describe('request data', () => {
      let scenario: ReturnType<typeof runScenario> | undefined;
      async function runScenario() {
        const requests = [
          { path: '/test-post', contentType: 'application/json', data: JSON.stringify({ foo: 'bar', other: 1 }) },
          { path: '/test-post', contentType: 'text/plain', data: 'some plain text' },
          {
            path: '/test-post',
            contentType: 'application/octet-stream',
            data: Buffer.from('some plain text in buffer'),
          },
          { path: '/test-post', contentType: 'application/octet-stream', data: new Uint8Array([1, 2, 3, 4, 5]).buffer },
          {
            path: '/test-post-ignore-body',
            contentType: 'application/octet-stream',
            data: Buffer.from('some plain text in buffer'),
          },
        ];
        const runner = createRunner().unordered();
        const spans = requests.map((_, index) =>
          runner.collectStreamedSpansUntilSegment(span => span.attributes['url.query']?.value === `case=${index}`),
        );
        const started = runner.start();
        for (const [index, { path, contentType, data }] of requests.entries()) {
          await started.makeRequest('post', `${path}?case=${index}`, {
            headers: { 'Content-Type': contentType },
            data,
          });
        }
        await started.completed();
        return Promise.all(spans);
      }
      async function getContainer(index: number) {
        scenario ??= runScenario();
        return { items: (await scenario)[index]! };
      }

      test('correctly captures JSON request data', async () => {
        const container = await getContainer(0);
        expect(findSegmentSpan(container)).toMatchObject({
          name: 'POST /test-post',
          attributes: expect.objectContaining({
            'url.full': {
              type: 'string',
              value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post\?case=0$/),
            },
            'http.request.method': { type: 'string', value: 'POST' },
            'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
            'http.request.header.content-type': { type: 'array', value: ['application/json'] },
            'http.request.body.data': { type: 'string', value: JSON.stringify({ foo: 'bar', other: 1 }) },
          }),
        });
      });

      test('correctly captures plain text request data', async () => {
        const container = await getContainer(1);
        expect(findSegmentSpan(container)).toMatchObject({
          name: 'POST /test-post',
          attributes: expect.objectContaining({
            'url.full': {
              type: 'string',
              value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post\?case=1$/),
            },
            'http.request.method': { type: 'string', value: 'POST' },
            'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
            'http.request.header.content-type': { type: 'array', value: ['text/plain'] },
            'http.request.body.data': { type: 'string', value: 'some plain text' },
          }),
        });
      });

      test('correctly captures text buffer request data', async () => {
        const container = await getContainer(2);
        expect(findSegmentSpan(container)).toMatchObject({
          name: 'POST /test-post',
          attributes: expect.objectContaining({
            'url.full': {
              type: 'string',
              value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post\?case=2$/),
            },
            'http.request.method': { type: 'string', value: 'POST' },
            'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
            'http.request.header.content-type': { type: 'array', value: ['application/octet-stream'] },
            'http.request.body.data': { type: 'string', value: 'some plain text in buffer' },
          }),
        });
      });

      test('correctly captures non-text buffer request data', async () => {
        const container = await getContainer(3);
        expect(findSegmentSpan(container)).toMatchObject({
          name: 'POST /test-post',
          attributes: expect.objectContaining({
            'url.full': {
              type: 'string',
              value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post\?case=3$/),
            },
            'http.request.method': { type: 'string', value: 'POST' },
            'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
            'http.request.header.content-type': { type: 'array', value: ['application/octet-stream'] },
            // This is some non-ascii string representation
            'http.request.body.data': { type: 'string', value: expect.any(String) },
          }),
        });
      });

      test('correctly ignores request data', async () => {
        const container = await getContainer(4);
        const serverSpan = findSegmentSpan(container);
        expect(serverSpan).toMatchObject({
          name: 'POST /test-post-ignore-body',
          attributes: expect.objectContaining({
            'url.full': {
              type: 'string',
              value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post-ignore-body\?case=4$/),
            },
            'http.request.method': { type: 'string', value: 'POST' },
            'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
            'http.request.header.content-type': { type: 'array', value: ['application/octet-stream'] },
          }),
        });
        // Ensure the request body has been ignored
        expect(serverSpan?.attributes['http.request.body.data']).toBeUndefined();
      });
    });
  });
});
