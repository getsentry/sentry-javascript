import type { Client, Span, StartSpanOptions } from '@sentry/core';
import * as SentryCore from '@sentry/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withServerActionInstrumentation } from '../../src/common/withServerActionInstrumentation';

function mockClient(traceLifecycle: 'stream' | 'static'): void {
  vi.spyOn(SentryCore, 'getClient').mockReturnValue({
    getOptions: () => ({ traceLifecycle }),
    getDataCollectionOptions: () => ({ httpBodies: [] }),
  } as unknown as Client);
}

function mockStartSpan() {
  return vi
    .spyOn(SentryCore, 'startSpan')
    .mockImplementation(<T>(_options: StartSpanOptions, callback: (span: Span) => T): T =>
      callback({ setStatus: vi.fn(), end: vi.fn() } as unknown as Span),
    );
}

describe('withServerActionInstrumentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the bare server action name as span name when span streaming is enabled', async () => {
    mockClient('stream');
    const startSpan = mockStartSpan();

    await withServerActionInstrumentation('myServerAction', {}, () => 'result');

    expect(startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'myServerAction',
        attributes: expect.objectContaining({
          'sentry.description': 'serverAction/myServerAction',
          'code.function.name': 'myServerAction',
          'sentry.op': 'function',
          'sentry.origin': 'auto.function.nextjs.server_action',
        }),
      }),
      expect.any(Function),
    );
  });

  it('keeps the prefixed span name when span streaming is disabled', async () => {
    mockClient('static');
    const startSpan = mockStartSpan();

    await withServerActionInstrumentation('myServerAction', {}, () => 'result');

    expect(startSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'serverAction/myServerAction',
        attributes: expect.objectContaining({
          'sentry.description': 'serverAction/myServerAction',
          'code.function.name': 'myServerAction',
        }),
      }),
      expect.any(Function),
    );
  });
});
