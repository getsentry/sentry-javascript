import type { Client } from '@sentry/core';
import { createTransport, Scope, ServerRuntimeClient, withScope } from '@sentry/core';
import { EventEmitter } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { recordRequestSession } from '../../src/integrations/http/httpServerIntegration';

vi.useFakeTimers();

describe('recordRequestSession()', () => {
  it('should send an "exited" session for an ok ended request', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    vi.setSystemTime(new Date('March 19, 1999 06:12:34 UTC'));

    simulateRequest(client, 'ok');

    vi.runAllTimers();

    expect(sendSessionSpy).toBeCalledWith({
      aggregates: [{ crashed: 0, errored: 0, exited: 1, started: '1999-03-19T06:12:00.000Z' }],
    });
  });

  it('should send an "crashed" session when the session on the requestProcessingMetadata was overridden with crashed', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    vi.setSystemTime(new Date('March 19, 1999 06:12:34 UTC'));

    simulateRequest(client, 'crashed');

    vi.runAllTimers();

    expect(sendSessionSpy).toBeCalledWith({
      aggregates: [{ crashed: 1, errored: 0, exited: 0, started: expect.stringMatching(/....-..-..T..:..:00.000Z/) }],
    });
  });

  it('should send an "errored" session when the session on the requestProcessingMetadata was overridden with errored', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    vi.setSystemTime(new Date('March 19, 1999 06:12:34 UTC'));

    simulateRequest(client, 'errored');

    vi.runAllTimers();

    expect(sendSessionSpy).toBeCalledWith({
      aggregates: [{ crashed: 0, errored: 1, exited: 0, started: expect.stringMatching(/....-..-..T..:..:00.000Z/) }],
    });
  });

  it('should aggregate request sessions within a time frame', async () => {
    const client = createTestClient();

    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    vi.setSystemTime(new Date('March 19, 1999 06:00:00 UTC'));

    simulateRequest(client, 'ok');
    simulateRequest(client, 'ok');
    simulateRequest(client, 'crashed');
    simulateRequest(client, 'errored');

    // "Wait" 1+ second to get into new bucket
    vi.setSystemTime(new Date('March 19, 1999 06:01:01 UTC'));

    simulateRequest(client, 'ok');
    simulateRequest(client, 'errored');

    vi.runAllTimers();

    expect(sendSessionSpy).toBeCalledWith({
      aggregates: [
        {
          crashed: 1,
          errored: 1,
          exited: 2,
          started: '1999-03-19T06:00:00.000Z',
        },
        { crashed: 0, errored: 1, exited: 1, started: '1999-03-19T06:01:00.000Z' },
      ],
    });
  });

  it('should flush pending sessions when the client emits a "flush" hook', async () => {
    const client = createTestClient();

    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    vi.setSystemTime(new Date('March 19, 1999 06:00:00 UTC'));

    simulateRequest(client, 'ok');

    // "Wait" 1+ second to get into new bucket
    vi.setSystemTime(new Date('March 19, 1999 06:01:01 UTC'));

    simulateRequest(client, 'ok');

    client.emit('flush');

    expect(sendSessionSpy).toBeCalledWith({
      aggregates: [
        {
          crashed: 0,
          errored: 0,
          exited: 1,
          started: '1999-03-19T06:00:00.000Z',
        },
        {
          crashed: 0,
          errored: 0,
          exited: 1,
          started: '1999-03-19T06:01:00.000Z',
        },
      ],
    });
  });
});

function simulateRequest(client: Client, status: 'ok' | 'errored' | 'crashed') {
  const requestIsolationScope = new Scope();
  const response = new EventEmitter();

  recordRequestSession(client, {
    requestIsolationScope,
    response,
  });

  requestIsolationScope.getScopeData().sdkProcessingMetadata.requestSession!.status = status;

  withScope(scope => {
    scope.setClient(client);
    // "end" request
    response.emit('close');
  });
}

function createTestClient() {
  return new ServerRuntimeClient({
    integrations: [],
    transport: () =>
      createTransport(
        {
          recordDroppedEvent: () => undefined,
        },
        () => Promise.resolve({}),
      ),
    stackParser: () => [],
  });
}
