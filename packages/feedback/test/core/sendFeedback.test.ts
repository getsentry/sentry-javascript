/**
 * @vitest-environment jsdom
 */
import {
  addBreadcrumb,
  getClient,
  getCurrentScope,
  getIsolationScope,
  startSpan,
  withIsolationScope,
  withScope,
} from '@sentry/core';
import { TextDecoder, TextEncoder } from 'util';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendFeedback } from '../../src/core/sendFeedback';
import { mockSdk } from './mockSdk';

const patchedEncoder = (!global.window.TextEncoder && (global.window.TextEncoder = TextEncoder)) || true;
// @ts-expect-error patch the encoder on the window, else importing JSDOM fails (deleted in afterAll)
const patchedDecoder = (!global.window.TextDecoder && (global.window.TextDecoder = TextDecoder)) || true;

describe('sendFeedback', () => {
  beforeEach(() => {
    getIsolationScope().clear();
    getCurrentScope().clear();
    vi.clearAllMocks();
  });

  afterAll(() => {
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedEncoder && delete global.window.TextEncoder;
    // @ts-expect-error patch the encoder on the window, else importing JSDOM fails
    patchedDecoder && delete global.window.TextDecoder;
  });

  it('sends feedback with minimal options', async () => {
    mockSdk();
    const mockTransport = vi.spyOn(getClient()!.getTransport()!, 'send');

    const promise = sendFeedback({
      message: 'mi',
    });

    expect(promise).toBeInstanceOf(Promise);

    const eventId = await promise;

    expect(typeof eventId).toEqual('string');

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: expect.any(String),
        sent_at: expect.any(String),
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          environment: 'production',
          public_key: 'dsn',
        },
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              feedback: {
                message: 'mi',
                source: 'api',
                url: 'http://localhost:3000/',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  it('sends feedback with full options', async () => {
    mockSdk();
    const mockTransport = vi.spyOn(getClient()!.getTransport()!, 'send');

    const promise = sendFeedback({
      name: 'doe',
      email: 're@example.org',
      message: 'mi',
      url: 'http://example.com/',
      source: 'custom-source',
      associatedEventId: '1234',
    });

    expect(promise).toBeInstanceOf(Promise);

    const eventId = await promise;

    expect(typeof eventId).toEqual('string');

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: expect.any(String),
        sent_at: expect.any(String),
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          environment: 'production',
          public_key: 'dsn',
        },
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              feedback: {
                name: 'doe',
                contact_email: 're@example.org',
                message: 'mi',
                url: 'http://example.com/',
                source: 'custom-source',
                associated_event_id: '1234',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  it('applies active span data to feedback', async () => {
    mockSdk({ sentryOptions: { tracesSampleRate: 1 } });
    const mockTransport = vi.spyOn(getClient()!.getTransport()!, 'send');

    await startSpan({ name: 'test span' }, () => {
      return sendFeedback({
        name: 'doe',
        email: 're@example.org',
        message: 'mi',
      });
    });

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: expect.any(String),
        sent_at: expect.any(String),
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          environment: 'production',
          public_key: 'dsn',
          sample_rate: '1',
          sampled: 'true',
          transaction: 'test span',
          sample_rand: expect.any(String),
        },
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              feedback: {
                contact_email: 're@example.org',
                message: 'mi',
                name: 'doe',
                source: 'api',
                url: 'http://localhost:3000/',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  it('applies scope data to feedback', async () => {
    mockSdk({ sentryOptions: { tracesSampleRate: 1 } });
    const mockTransport = vi.spyOn(getClient()!.getTransport()!, 'send');

    await withIsolationScope(isolationScope => {
      isolationScope.setTag('test-1', 'tag');
      isolationScope.setExtra('test-1', 'extra');

      return withScope(scope => {
        scope.setTag('test-2', 'tag');
        scope.setExtra('test-2', 'extra');

        addBreadcrumb({ message: 'test breadcrumb', timestamp: 12345 });

        return sendFeedback({
          name: 'doe',
          email: 're@example.org',
          message: 'mi',
        });
      });
    });

    expect(mockTransport).toHaveBeenCalledWith([
      {
        event_id: expect.any(String),
        sent_at: expect.any(String),
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          environment: 'production',
          public_key: 'dsn',
        },
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: [{ message: 'test breadcrumb', timestamp: 12345 }],
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              feedback: {
                contact_email: 're@example.org',
                message: 'mi',
                name: 'doe',
                source: 'api',
                url: 'http://localhost:3000/',
              },
            },
            extra: {
              'test-1': 'extra',
              'test-2': 'extra',
            },
            tags: {
              'test-1': 'tag',
              'test-2': 'tag',
            },
            level: 'info',
            environment: 'production',
            event_id: expect.any(String),
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
      ],
    ]);
  });

  it('handles 400 transport error', async () => {
    mockSdk();
    vi.spyOn(getClient()!.getTransport()!, 'send').mockImplementation(() => {
      return Promise.resolve({ statusCode: 400 });
    });

    await expect(
      sendFeedback({
        name: 'doe',
        email: 're@example.org',
        message: 'mi',
      }),
    ).rejects.toMatch(
      'Unable to send feedback. This could be because of network issues, or because you are using an ad-blocker.',
    );
  });

  it('handles 0 transport error', async () => {
    mockSdk();
    vi.spyOn(getClient()!.getTransport()!, 'send').mockImplementation(() => {
      return Promise.resolve({ statusCode: 0 });
    });

    await expect(
      sendFeedback({
        name: 'doe',
        email: 're@example.org',
        message: 'mi',
      }),
    ).rejects.toMatch(
      'Unable to send feedback. This could be because of network issues, or because you are using an ad-blocker.',
    );
  });

  it('handles 403 transport error', async () => {
    mockSdk();
    vi.spyOn(getClient()!.getTransport()!, 'send').mockImplementation(() => {
      return Promise.resolve({ statusCode: 403 });
    });

    await expect(
      sendFeedback({
        name: 'doe',
        email: 're@example.org',
        message: 'mi',
      }),
    ).rejects.toMatch(
      'Unable to send feedback. This could be because this domain is not in your list of allowed domains.',
    );
  });

  it('handles 200 transport response', async () => {
    mockSdk();
    vi.spyOn(getClient()!.getTransport()!, 'send').mockImplementation(() => {
      return Promise.resolve({ statusCode: 200 });
    });

    await expect(
      sendFeedback({
        name: 'doe',
        email: 're@example.org',
        message: 'mi',
      }),
    ).resolves.toEqual(expect.any(String));
  });

  it('handles timeout', async () => {
    vi.useFakeTimers();

    mockSdk();
    vi.spyOn(getClient()!.getTransport()!, 'send').mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 40_000));
    });

    const promise = sendFeedback({
      name: 'doe',
      email: 're@example.org',
      message: 'mi',
    });

    vi.advanceTimersByTime(30_000);

    await expect(promise).rejects.toMatch('Unable to determine if Feedback was correctly sent.');

    vi.useRealTimers();
  });

  it('sends attachments', async () => {
    mockSdk();
    const mockTransport = vi.spyOn(getClient()!.getTransport()!, 'send');

    const attachment1 = new Uint8Array([1, 2, 3, 4, 5]);
    const attachment2 = new Uint8Array([6, 7, 8, 9]);

    const promise = sendFeedback(
      {
        name: 'doe',
        email: 're@example.org',
        message: 'mi',
      },
      {
        attachments: [
          {
            data: attachment1,
            filename: 'test-file.txt',
          },
          {
            data: attachment2,
            filename: 'test-file2.txt',
          },
        ],
      },
    );

    expect(promise).toBeInstanceOf(Promise);

    const eventId = await promise;

    expect(typeof eventId).toEqual('string');
    expect(mockTransport).toHaveBeenCalledTimes(1);

    const [feedbackEnvelope] = mockTransport.mock.calls;

    expect(feedbackEnvelope?.[0]).toEqual([
      {
        event_id: eventId,
        sent_at: expect.any(String),
        trace: {
          trace_id: expect.stringMatching(/[a-f0-9]{32}/),
          environment: 'production',
          public_key: 'dsn',
        },
      },
      [
        [
          { type: 'feedback' },
          {
            breadcrumbs: undefined,
            contexts: {
              trace: {
                span_id: expect.stringMatching(/[a-f0-9]{16}/),
                trace_id: expect.stringMatching(/[a-f0-9]{32}/),
              },
              feedback: {
                contact_email: 're@example.org',
                message: 'mi',
                name: 'doe',
                source: 'api',
                url: 'http://localhost:3000/',
              },
            },
            level: 'info',
            environment: 'production',
            event_id: eventId,
            timestamp: expect.any(Number),
            type: 'feedback',
          },
        ],
        [
          {
            type: 'attachment',
            length: 5,
            filename: 'test-file.txt',
          },
          attachment1,
        ],
        [
          {
            type: 'attachment',
            length: 4,
            filename: 'test-file2.txt',
          },
          attachment2,
        ],
      ],
    ]);
  });
});
