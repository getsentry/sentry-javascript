import { EventEmitter } from 'node:events';
import type { Client, Span } from '@sentry/core';
import type * as SentryCore from '@sentry/core';
import { getActiveSpan } from '@sentry/core';
import type * as SentryServerUtils from '@sentry/server-utils';
import { subscribeDiagnosticsChannel } from '@sentry/server-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupVercelKeepAlive } from '../../src/sdk/vercel';

vi.mock('@sentry/core', async importOriginal => ({
  ...(await importOriginal<typeof SentryCore>()),
  getActiveSpan: vi.fn(),
}));

vi.mock('@sentry/server-utils', async importOriginal => ({
  ...(await importOriginal<typeof SentryServerUtils>()),
  subscribeDiagnosticsChannel: vi.fn(),
}));

const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

function createClient() {
  const spanEndCallbacks = new Set<(span: Span) => void>();
  return {
    on: vi.fn((_hook: 'spanEnd', callback: (span: Span) => void) => {
      spanEndCallbacks.add(callback);
      return () => spanEndCallbacks.delete(callback);
    }),
    flush: vi.fn().mockResolvedValue(true),
    endSpan: (span: Span) => spanEndCallbacks.forEach(callback => callback(span)),
  };
}

function setActiveRootSpan(): Span {
  const span = { isRecording: () => true } as unknown as Span;
  vi.mocked(getActiveSpan).mockReturnValue(span);
  return span;
}

function finishResponse() {
  const response = new EventEmitter();
  const [, onMessage] = vi.mocked(subscribeDiagnosticsChannel).mock.calls.at(-1)!;
  onMessage({ request: new EventEmitter(), response }, 'http.server.response.finish');
  return response;
}

describe('setupVercelKeepAlive', () => {
  let waitUntil: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    waitUntil = vi.fn();
    (globalThis as any)[REQUEST_CONTEXT] = { get: () => ({ waitUntil }) };
    vi.spyOn(process, 'on').mockImplementation(() => process);
  });

  afterEach(() => {
    (globalThis as any)[REQUEST_CONTEXT] = undefined;
    vi.mocked(getActiveSpan).mockReturnValue(undefined);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registers exactly one waitUntil per finished response', () => {
    setupVercelKeepAlive(createClient() as unknown as Client);

    // Vercel does not publish `http.server.request.start` for function requests.
    expect(subscribeDiagnosticsChannel).toHaveBeenCalledWith('http.server.response.finish', expect.any(Function));

    finishResponse();
    expect(waitUntil).toHaveBeenCalledTimes(1);

    finishResponse();
    expect(waitUntil).toHaveBeenCalledTimes(2);
  });

  it('keeps the task pending until the response closes, then flushes the client once', async () => {
    const client = createClient();
    setupVercelKeepAlive(client as unknown as Client);

    const response = finishResponse();
    const task = waitUntil.mock.calls[0]![0] as Promise<unknown>;
    const settled = vi.fn();
    void task.then(settled);

    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
    expect(client.flush).not.toHaveBeenCalled();

    response.emit('close');
    await task;

    expect(client.flush).toHaveBeenCalledTimes(1);
    expect(client.flush).toHaveBeenCalledWith(2000);
  });

  it('waits for the root span to end after the response closes, then flushes', async () => {
    const client = createClient();
    setupVercelKeepAlive(client as unknown as Client);
    const rootSpan = setActiveRootSpan();

    const response = finishResponse();
    const task = waitUntil.mock.calls[0]![0] as Promise<unknown>;

    response.emit('close');
    await vi.advanceTimersByTimeAsync(0);
    expect(client.flush).not.toHaveBeenCalled();

    client.endSpan(rootSpan);
    await task;

    expect(client.flush).toHaveBeenCalledTimes(1);
  });

  it('flushes after 2 seconds when the root span does not end', async () => {
    const client = createClient();
    setupVercelKeepAlive(client as unknown as Client);
    setActiveRootSpan();

    const response = finishResponse();
    response.emit('close');

    await vi.advanceTimersByTimeAsync(1999);
    expect(client.flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(client.flush).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a request context', () => {
    (globalThis as any)[REQUEST_CONTEXT] = undefined;
    setupVercelKeepAlive(createClient() as unknown as Client);

    finishResponse();

    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('does nothing when the request context has no waitUntil', () => {
    (globalThis as any)[REQUEST_CONTEXT] = { get: () => ({}) };
    setupVercelKeepAlive(createClient() as unknown as Client);

    expect(() => finishResponse()).not.toThrow();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it('does not depend on a span', async () => {
    const client = createClient();
    setupVercelKeepAlive(client as unknown as Client);

    const response = finishResponse();
    response.emit('close');
    await (waitUntil.mock.calls[0]![0] as Promise<unknown>);

    expect(client.flush).toHaveBeenCalledTimes(1);
  });
});
