import { expect, it } from 'vitest';
import { eventEnvelope } from '../../../expect';
import { createRunner } from '../../../runner';

it('Captures JSON request body', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope({
        level: 'info',
        message: 'POST JSON request',
        request: {
          headers: expect.any(Object),
          method: 'POST',
          url: expect.stringContaining('/post-json'),
          data: '{"username":"test","action":"login"}',
        },
      }),
    )
    .start(signal);

  await runner.makeRequest('post', '/post-json', {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ username: 'test', action: 'login' }),
  });

  await runner.completed();
});

it('Captures form-urlencoded request body', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope({
        level: 'info',
        message: 'POST form request',
        request: {
          headers: expect.any(Object),
          method: 'POST',
          url: expect.stringContaining('/post-form'),
          data: 'username=test&password=secret',
        },
      }),
    )
    .start(signal);

  await runner.makeRequest('post', '/post-form', {
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    data: 'username=test&password=secret',
  });

  await runner.completed();
});

it('Captures plain text request body', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope({
        level: 'info',
        message: 'POST text request',
        request: {
          headers: expect.any(Object),
          method: 'POST',
          url: expect.stringContaining('/post-text'),
          data: 'This is plain text content',
        },
      }),
    )
    .start(signal);

  await runner.makeRequest('post', '/post-text', {
    headers: { 'content-type': 'text/plain' },
    data: 'This is plain text content',
  });

  await runner.completed();
});

it('Does not capture body for POST without content', async ({ signal }) => {
  const runner = createRunner(__dirname)
    .expect(
      eventEnvelope({
        level: 'info',
        message: 'POST no body request',
        request: {
          headers: expect.any(Object),
          method: 'POST',
          url: expect.stringContaining('/post-no-body'),
        },
      }),
    )
    .start(signal);

  await runner.makeRequest('post', '/post-no-body', {});

  await runner.completed();
});
