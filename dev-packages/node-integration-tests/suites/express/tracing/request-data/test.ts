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
      test('correctly captures JSON request data', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
                  'http.request.header.content-type': { type: 'array', value: ['application/json'] },
                  'http.request.body.data': { type: 'string', value: JSON.stringify({ foo: 'bar', other: 1 }) },
                }),
              });
            },
          })
          .start();

        runner.makeRequest('post', '/test-post', {
          headers: {
            'Content-Type': 'application/json',
          },
          data: JSON.stringify({ foo: 'bar', other: 1 }),
        });
        await runner.completed();
      });

      test('correctly captures plain text request data', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
                  'http.request.header.content-type': { type: 'array', value: ['text/plain'] },
                  'http.request.body.data': { type: 'string', value: 'some plain text' },
                }),
              });
            },
          })
          .start();

        runner.makeRequest('post', '/test-post', {
          headers: { 'Content-Type': 'text/plain' },
          data: 'some plain text',
        });
        await runner.completed();
      });

      test('correctly captures text buffer request data', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
                  'http.request.header.content-type': { type: 'array', value: ['application/octet-stream'] },
                  'http.request.body.data': { type: 'string', value: 'some plain text in buffer' },
                }),
              });
            },
          })
          .start();

        runner.makeRequest('post', '/test-post', {
          headers: { 'Content-Type': 'application/octet-stream' },
          data: Buffer.from('some plain text in buffer'),
        });
        await runner.completed();
      });

      test('correctly captures non-text buffer request data', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              expect(findSegmentSpan(container)).toMatchObject({
                name: 'POST /test-post',
                attributes: expect.objectContaining({
                  'url.full': { type: 'string', value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post$/) },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
                  'http.request.header.content-type': { type: 'array', value: ['application/octet-stream'] },
                  // This is some non-ascii string representation
                  'http.request.body.data': { type: 'string', value: expect.any(String) },
                }),
              });
            },
          })
          .start();

        const body = new Uint8Array([1, 2, 3, 4, 5]).buffer;

        runner.makeRequest('post', '/test-post', {
          headers: { 'Content-Type': 'application/octet-stream' },
          data: body,
        });
        await runner.completed();
      });

      test('correctly ignores request data', async () => {
        const runner = createRunner()
          .expect({
            span: container => {
              const serverSpan = findSegmentSpan(container);
              expect(serverSpan).toMatchObject({
                name: 'POST /test-post-ignore-body',
                attributes: expect.objectContaining({
                  'url.full': {
                    type: 'string',
                    value: expect.stringMatching(/^http:\/\/localhost:(\d+)\/test-post-ignore-body$/),
                  },
                  'http.request.method': { type: 'string', value: 'POST' },
                  'http.request.header.user-agent': { type: 'array', value: [expect.stringContaining('')] },
                  'http.request.header.content-type': { type: 'array', value: ['application/octet-stream'] },
                }),
              });
              // Ensure the request body has been ignored
              expect(serverSpan?.attributes['http.request.body.data']).toBeUndefined();
            },
          })
          .start();

        runner.makeRequest('post', '/test-post-ignore-body', {
          headers: { 'Content-Type': 'application/octet-stream' },
          data: Buffer.from('some plain text in buffer'),
        });
        await runner.completed();
      });
    });
  });
});
