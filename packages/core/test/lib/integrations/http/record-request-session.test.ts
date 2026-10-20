import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordRequestSession, startRequestSession } from '../../../../src/integrations/http/record-request-session';
import { Scope } from '../../../../src/scope';
import { getDefaultTestClientOptions, TestClient } from '../../../mocks/client';

function createTestClient(): TestClient {
  return new TestClient(getDefaultTestClientOptions({ release: '1.0.0' }));
}

describe('startRequestSession()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('March 19, 1999 06:12:34 UTC'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the session when end() is called', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');
    const requestIsolationScope = new Scope();

    const end = startRequestSession(client, { requestIsolationScope });
    vi.runAllTimers();
    expect(sendSessionSpy).not.toHaveBeenCalled();

    end();
    vi.runAllTimers();

    expect(sendSessionSpy).toHaveBeenCalledWith({
      aggregates: [{ crashed: 0, errored: 0, exited: 1, started: '1999-03-19T06:12:00.000Z' }],
    });
  });

  it('counts the status set on the request isolation scope before end()', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');
    const requestIsolationScope = new Scope();

    const end = startRequestSession(client, { requestIsolationScope });
    requestIsolationScope.getScopeData().sdkProcessingMetadata.requestSession!.status = 'crashed';
    end();
    vi.runAllTimers();

    expect(sendSessionSpy).toHaveBeenCalledWith({
      aggregates: [{ crashed: 1, errored: 0, exited: 0, started: '1999-03-19T06:12:00.000Z' }],
    });
  });

  it('counts a session once when end() is called more than once', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');
    const requestIsolationScope = new Scope();

    const end = startRequestSession(client, { requestIsolationScope });
    end();
    end();
    vi.runAllTimers();

    expect(sendSessionSpy).toHaveBeenCalledTimes(1);
    expect(sendSessionSpy).toHaveBeenCalledWith({
      aggregates: [{ crashed: 0, errored: 0, exited: 1, started: '1999-03-19T06:12:00.000Z' }],
    });
  });

  it('emits the "startRequestSession" hook when the session starts', () => {
    const client = createTestClient();
    const onStartRequestSession = vi.fn();
    client.on('startRequestSession', onStartRequestSession);

    startRequestSession(client, { requestIsolationScope: new Scope() });

    expect(onStartRequestSession).toHaveBeenCalledTimes(1);
  });

  it('uses sessionFlushingDelayMS to schedule the aggregate', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    startRequestSession(client, { requestIsolationScope: new Scope(), sessionFlushingDelayMS: 1_000 })();

    vi.advanceTimersByTime(999);
    expect(sendSessionSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sendSessionSpy).toHaveBeenCalledTimes(1);
  });
  it('sends the aggregate after 60 seconds by default', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');

    startRequestSession(client, { requestIsolationScope: new Scope() })();

    vi.advanceTimersByTime(59_999);
    expect(sendSessionSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sendSessionSpy).toHaveBeenCalledTimes(1);
  });
});

describe('recordRequestSession()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('March 19, 1999 06:12:34 UTC'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the session when the response emits close', () => {
    const client = createTestClient();
    const sendSessionSpy = vi.spyOn(client, 'sendSession');
    const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {} });

    recordRequestSession(client, { requestIsolationScope: new Scope(), response });
    vi.runAllTimers();
    expect(sendSessionSpy).not.toHaveBeenCalled();

    response.emit('close');
    vi.runAllTimers();

    expect(sendSessionSpy).toHaveBeenCalledWith({
      aggregates: [{ crashed: 0, errored: 0, exited: 1, started: '1999-03-19T06:12:00.000Z' }],
    });
  });
});
