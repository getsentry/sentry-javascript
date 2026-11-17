import { afterAll, describe, expect } from 'vitest';
import { cleanupChildProcesses, createEsmAndCjsTests } from '../../../../utils/runner';
import { join } from 'node:path';

describe('express tracing', () => {
  afterAll(() => {
    cleanupChildProcesses();
  });
  createEsmAndCjsTests(join(__dirname, '..'), 'scenario.mjs', 'instrument.mjs', (createRunner, test) => {
    // With span streaming, child spans are sent as they end, before the response status code is
    // known, so `ignoreStatusCodes` has no effect and these routes are captured like any other.

    describe('request data', () => {
      test('captures and ignores request data for each content type', async () => {
        const cases = [
          {
            path: '/test-post',
            contentType: 'application/json',
            data: JSON.stringify({ foo: 'bar', other: 1 }),
            expectedBody: JSON.stringify({ foo: 'bar', other: 1 }),
          },
          {
            path: '/test-post',
            contentType: 'text/plain',
            data: 'some plain text',
            expectedBody: 'some plain text',
          },
          {
            path: '/test-post',
            contentType: 'application/octet-stream',
            data: Buffer.from('some plain text in buffer'),
            expectedBody: 'some plain text in buffer',
          },
          {
            path: '/test-post',
            contentType: 'application/octet-stream',
            data: new Uint8Array([1, 2, 3, 4, 5]).buffer,
            expectedBody: expect.any(String),
          },
          {
            path: '/test-post-ignore-body',
            contentType: 'application/octet-stream',
            data: Buffer.from('some plain text in buffer'),
            expectedBody: undefined,
          },
        ];
        const runner = createRunner().unordered();
        const spans = cases.map((_, index) =>
          runner.collectStreamedSpansUntilSegment(span => span.attributes['url.query']?.value === `case=${index}`),
        );
        const started = runner.start();

        for (const [index, { path, contentType, data, expectedBody }] of cases.entries()) {
          const url = `${path}?case=${index}`;
          await started.makeRequest('post', url, {
            headers: { 'Content-Type': contentType },
            data,
          });
          const serverSpan = (await spans[index]!).find(span => span.is_segment);

          expect(serverSpan, contentType).toMatchObject({
            name: `POST ${path}`,
            attributes: expect.objectContaining({
              'url.full': { type: 'string', value: `http://localhost:${started.getPort()}${url}` },
              'http.request.method': { type: 'string', value: 'POST' },
              'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
              'http.request.header.content-type': { type: 'array', value: [contentType] },
            }),
          });
          expect(serverSpan?.attributes['http.request.body.data'], contentType).toEqual(
            expectedBody === undefined ? undefined : { type: 'string', value: expectedBody },
          );
        }
        await started.completed();
      });
    });
  });
});
